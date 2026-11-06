# ADR-0050: Native-Tool-First Agent Permissions

**Status:** Accepted

## Context

ADR-0036 allowed shell commands by default and maintained deny lists for destructive prefixes. The model was compact but grants far more than a role needs, and read-only roles accumulated long, bypassable shell deny lists.

OpenCode v1 exposes native `read`, `glob`, `grep`, `skill`, `webfetch`, `websearch`, and `task` permissions. File mutation tools (`edit`, `write`, and `apply_patch`) are governed by the single `edit` permission. These native tools cover ordinary repository investigation without a shell.

## Decision

1. Deny external-directory access for every agent.
2. Explicitly allow native read tools (`read`, `glob`, `grep`, `skill`) for every agent.
3. Allow `webfetch` and `websearch` only for roles that perform bounded research: `planner`, `research`, `auditor`, and `scout`.
4. Default shell commands to `ask`, not automatic `allow`. `research`, `scout`, and `architect` receive `bash: deny` because their roles need no shell.
5. Retain narrow automatic shell exceptions: `delivery` may run `git commit*`; experimental `implementer` may run `git commit*`, exact safe Git inspection commands, and exact read-only `ai-memory` status/close-check commands. All builds, tests, linters, E2E checks, and other project-specific commands require approval.
6. Keep existing `edit` and `task` authority boundaries. In particular, `edit: deny` blocks `edit`, `write`, and `apply_patch`; only `implementer` and `auditor` may dispatch the experimental `scout`.
7. Use `permission.skill` allowlists for each agent. The installed skill catalog remains global, but denied skills are hidden; skill frontmatter metadata remains descriptive rather than authoritative.
8. Scope durable-memory edits by path: `planner` may write `docs/ai/**`; `auditor` may write only `docs/ai/plans/**` and `docs/ai/logs/**` to record audit evidence and durable outcomes. `implementer` retains product-write authority and may evolve active experimental plans and factual `docs/ai/**` memory under ADR-0049.

## Consequences

- Scouts use native inspection and web tools with no shell capability.
- Auditors remain read-only but may run an explicitly approved build, verification, or E2E command when independent evidence requires it.
- Implementation validation remains possible, but unfamiliar project commands require approval instead of being implicitly trusted.
- Permission blocks shrink and become capability-oriented rather than relying on incomplete shell deny lists.
- An agent cannot load a skill outside its role's allowlist; changing skill ownership requires a permission-matrix and documentation update.
- Planner no longer prompts for ordinary `docs/ai/**` maintenance, implementer does not need planner round-trips for evidenced experimental-plan drift, and auditor cannot modify product files, architecture notes, or ADRs.

## Supersedes

Supersedes ADR-0036's allow-by-default shell and prefix-deny-list policy. The flat YAML parser and centralized permission rendering architecture remain unchanged.

## Related

- ADR-0036: Simplify Agent Permissions to Coarse Allow + Deny-List Model.
- ADR-0049: Experimental Plan-Completion Audit Workflow.
- `base/opencode/permissions/agents.yml`
