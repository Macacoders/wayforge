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

- `plan` is the default primary agent.
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

1. Plan with clarifying questions and acceptance criteria.
2. Implement one approved phase through `code`.
3. Pause after each atomic stage for manual validation.
4. Review the completed phase with git evidence.
5. Invoke `test` only when useful.
6. Update docs, decisions, and logs at close.

## Invariants

- Keep installation project-local.
- Keep subagent handoffs compact.
- Keep `test` independent and critical of `code` output.
- Keep manual validation checkpoints between atomic stages.
- Keep durable memory under `docs/ai/`.
