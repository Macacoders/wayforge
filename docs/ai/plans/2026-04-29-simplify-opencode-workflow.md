# Plan: Simplify AI Config Around OpenCode

Date: 2026-04-29
Status: Completed

## Goal

Refactor this repository into a small, project-local OpenCode configuration that reflects the staged daily development workflow.

## Phases

### Phase 1: Documentation Contract

Acceptance criteria:

- `README.md` describes OpenCode-only and OpenAI-only scope.
- Workflow, agents, progressive disclosure, memory, and symlink install model are documented.

Status: Completed

### Phase 2: OpenCode Configuration

Acceptance criteria:

- `opencode.jsonc` exists.
- `.opencode/agents/plan.md`, `.opencode/agents/code.md`, and `.opencode/agents/test.md` exist.
- Commands and the staged delivery skill exist.

Status: Completed

### Phase 3: Persistent Memory

Acceptance criteria:

- `docs/ai/` contains an index, architecture note, ADRs, log, and this active plan.
- Memory rules reinforce progressive disclosure.

Status: Completed

### Phase 4: Installation Rewrite

Acceptance criteria:

- `install/bootstrap.sh --repo <path>` creates project-local symlinks.
- Existing non-symlink files are not overwritten by default.
- `--dry-run` and `--force` are supported.

Status: Completed

### Phase 5: Cleanup

Acceptance criteria:

- Old VS Code Copilot adapters, generic roles, broad skills, and obsolete templates are removed.
- Remaining docs and scripts do not describe the old workflow as active.

Status: Completed

### Phase 6: Validation

Acceptance criteria:

- Search finds no active references to removed workflows.
- Bootstrap dry-run works against a temporary target repository.
- Git diff aligns with this plan.

Status: Completed

## Decisions

- Use OpenCode as the only runtime.
- Use OpenAI as the only provider.
- Use `plan` as the only primary agent.
- Use `research` as the onboarding subagent for unfamiliar repositories.
- Use `code` and `test` as subagents.
- Keep one `code` child session per implementation phase.
- Persist durable memory under `docs/ai/`.
