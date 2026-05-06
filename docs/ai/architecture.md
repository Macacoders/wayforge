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
- `quickcode` is a subagent invoked by `planner` for one approved quick-delivery task. It may edit autonomously within narrow low-risk scope, run allowlisted validation/git inspection commands, and must not invoke subagents.
- `test` is a subagent used when review identifies meaningful testing or regression risk.

## Context Strategy

The system uses progressive disclosure:

- Agents start from indexes and task-specific references.
- Handoffs contain compact briefs and reference paths.
- Subagents do not inherit whole planning transcripts.
- Persistent memory stores durable decisions, not chat history.

## Workflow Boundaries

The default staged-delivery workflow is:

1. Onboard unfamiliar repositories through `research` and create initial `docs/ai/` memory.
2. Plan with clarifying questions and acceptance criteria.
3. Implement one approved phase through `code`.
4. Pause after each atomic stage for manual validation.
5. Review the completed phase with git evidence.
6. Invoke `test` only when useful.
7. Update docs, decisions, and logs at close.

The opt-in quick-delivery workflow is:

1. Start with `/quick` or an explicit request for quick delivery.
2. `planner` confirms the task is clear, small, low-risk, and safe to validate locally.
3. `planner` invokes `quickcode` with a compact approved-scope handoff.
4. `quickcode` completes the approved task without staged pauses and reports once.
5. `planner` reviews the result with git evidence before responding.

Quick delivery escalates back to staged delivery when scope, risk, validation, or acceptance criteria become unclear.

## Invariants

- Keep installation project-local.
- Keep subagent handoffs compact.
- Keep repository onboarding separate from feature planning.
- Keep `test` independent and critical of `code` output.
- Keep manual validation checkpoints between atomic stages for staged delivery.
- Keep quick delivery limited to approved low-risk tasks with no staged pauses and mandatory planner review.
- Keep durable memory under `docs/ai/`.
