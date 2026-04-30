# AI Configuration Architecture

## Scope

This repository provides reusable OpenCode configuration for target projects through project-local symlinks.

## Runtime Boundary

- OpenCode is the only supported AI runtime.
- OpenAI is the only supported provider.
- Users authenticate OpenAI in OpenCode with `/connect`, preferably using ChatGPT Plus/Pro.
- Model IDs are recommendations and may need adjustment with `/models` depending on account availability.

## Installed Surface

Target projects should receive symlinks to:

- `opencode.jsonc`
- `.opencode/agents`
- `.opencode/commands`
- `.opencode/skills`
- `AGENTS.md`

The installer must not overwrite existing non-symlink files by default.

## Agent Topology

- `planner` is the default primary agent. It uses a non-native id to avoid colliding with OpenCode's built-in `plan` agent.
- `research` is a subagent used for onboarding existing repositories before implementation planning.
- `code` is a conservative subagent used once per approved implementation phase, with medium reasoning effort and low temperature.
- `test` is a subagent used when review identifies meaningful testing or regression risk.

## Context Strategy

The system uses progressive disclosure:

- Agents start from indexes and task-specific references.
- Handoffs contain compact briefs and reference paths.
- Subagents do not inherit whole planning transcripts.
- Persistent memory stores durable decisions, not chat history.

## Workflow Boundary

The intended workflow is:

1. Onboard unfamiliar repositories through `research` and create initial `docs/ai/` memory.
2. Plan with clarifying questions and acceptance criteria.
3. Implement one approved phase through `code`.
4. Pause after each atomic stage for manual validation.
5. Review the completed phase with git evidence.
6. Invoke `test` only when useful.
7. Update docs, decisions, and logs at close.

## Invariants

- Keep installation project-local.
- Keep subagent handoffs compact.
- Keep repository onboarding separate from feature planning.
- Keep `test` independent and critical of `code` output.
- Keep manual validation checkpoints between atomic stages.
- Keep durable memory under `docs/ai/`.
