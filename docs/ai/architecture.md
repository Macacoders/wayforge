# AI Configuration Architecture

## Scope

This repository provides reusable OpenCode configuration for target projects through project-local symlinks.

## Runtime Boundary

- OpenCode is the only supported AI runtime.
- **Primary provider**: OpenAI, authenticated in OpenCode with `/connect` using ChatGPT Plus/Pro.
- **Secondary provider**: Kimi25 (Azure-hosted Kimi K2.5), configured via environment variables (`KIMI_BASE_URL`, `KIMI_API_KEY`, `KIMI_API_VERSION`).
- Model IDs are recommendations and may need adjustment with `/models` depending on account availability.
- The default model policy balances GPT-5.5-family reasoning for planning, onboarding, and critical review with Codex-oriented models for implementation.
- Users can switch providers interactively: `/model openai/gpt-5.5` or `/model kimi25/Kimi-K2.5`.
- Agent-specific model assignments can be configured in `opencode.jsonc` to use different providers for different tasks.

## Installed Surface

Target projects should receive symlinks to:

- `opencode.jsonc`
- `.opencode/agents`
- `.opencode/commands`
- `.opencode/skills`
- `AGENTS.md`

The installer must not overwrite existing non-symlink files by default.

Portable workflow helpers used by shared commands should be packaged under `.opencode/skills/**` so they are available through the installed surface; consuming repositories should not require a top-level `scripts/` directory for those helpers.

## Agent Topology

- `planner` is the default primary agent. It uses a non-native id to avoid colliding with OpenCode's built-in `plan` agent.
- `research` is a subagent used for onboarding existing repositories before implementation planning.
- `code` is a conservative Codex-oriented subagent used once per approved implementation phase, with medium reasoning effort and low temperature.
- `quickcode` is a Codex-oriented subagent invoked by `planner` for one approved quick-delivery task, with low reasoning effort for small low-risk changes. It may edit autonomously within narrow low-risk scope, run allowlisted validation/git inspection commands, and must not invoke subagents.
- `test` is a GPT-5.5-fast subagent used when review identifies meaningful testing or regression risk, keeping critical review independent from Codex implementation output.
- `taskanalyst` is a GPT-5.5-fast subagent used by `/newtask` to interpret problem reports and propose structured GitHub Issue content without editing files.

## Context Strategy

The system uses progressive disclosure:

- Agents start from indexes and task-specific references.
- Handoffs contain compact briefs and reference paths.
- Subagents do not inherit whole planning transcripts.
- Persistent memory stores durable decisions, not chat history.
- Shared task operations live in GitHub Issues; repository direction and transition continuity should be captured through issues, ADRs, plans, architecture notes, and short logs.
- The active repository root is the default boundary for searches, reads, edits, commands, and reviews.
- Handoffs include `Repository root:` so subagents inherit the same boundary.

## Workflow Boundaries

The default staged-delivery workflow is:

1. Onboard unfamiliar repositories through `research` and create initial `docs/ai/` memory.
2. Plan with clarifying questions and acceptance criteria.
3. Apply phase economy before implementation: 1 phase for simple work, justification above 3 phases, explicit confirmation for 6-8 phases, and task splitting above 8 phases.
4. Implement one approved phase through `code`.
5. Pause after each atomic stage for manual validation.
6. Review the completed phase with git evidence.
7. Distinguish running existing validation, recommending tests, and creating new tests.
8. Do not invoke `test` by default.
9. Prefer existing validation or a no-test rationale for low-risk work before recommending new tests.
10. Invoke `test` in `write-tests` mode only when new test creation is explicitly approved (user request, approved acceptance criteria, or user-approved recommendation) and constrained by a concrete test budget.
11. Update docs, decisions, and logs at close.

The opt-in quick-delivery workflow is:

1. Start with `/quick` or an explicit request for quick delivery.
2. `planner` confirms the task is clear, small, low-risk, and safe to validate locally.
3. `planner` invokes `quickcode` with a compact approved-scope handoff.
4. `quickcode` completes the approved task without staged pauses and reports once.
5. `planner` reviews the result with git evidence before responding.

Quick delivery escalates back to staged delivery when scope, risk, validation, or acceptance criteria become unclear.

The shared task creation workflow is:

1. Start with `/newtask` and a problem, idea, or repository improvement request.
2. `planner` checks for potential duplicates in open GitHub Issues.
3. `planner` invokes `taskanalyst` to interpret the request and draft a concise issue body.
4. `planner` asks a concise clarification question only when critical details are missing or duplicate risk is unresolved.
5. `planner` creates a GitHub Issue with type/priority/status labels (initial status `status:to-do`).
6. `planner` reports the created issue number and URL.

## Invariants

- Keep installation project-local.
- Keep all operations inside the active repository root unless the user explicitly approves an external path.
- Keep subagent handoffs compact.
- Keep repository onboarding separate from feature planning.
- Keep phases as reviewable deliverables, not technical microtasks.
- Keep plans above 8 apparent implementation phases out of single-task planning; split them into smaller tasks first.
- Keep `test` independent and critical of `code` output.
- Keep new test creation strictly opt-in and auditable through Test Handoff Brief authorization fields.
- Keep test recommendations tied to observable behavior, concrete risk, insufficient existing validation, and minimal budget.
- Keep manual validation checkpoints between atomic stages for staged delivery.
- Keep quick delivery limited to approved low-risk tasks with no staged pauses and mandatory planner review.
- Keep durable memory under `docs/ai/`.
- Keep GitHub Issues as the operational shared source of truth for team tasks.
- Keep shared tasks in GitHub Issues rather than a local JSONL backlog.
- Keep shared task analysis separated from issue operations.
