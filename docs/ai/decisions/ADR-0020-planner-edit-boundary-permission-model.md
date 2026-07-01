# ADR-0020: Planner code implementation boundary — prompt-level guardrails with `edit: ask` permission

**Date**: 2026-07-01
**Status**: Accepted

## Context

Issue #54 identified that the Planner agent's guardrail against direct code implementation was weak — a single bullet point in "Core Rules" that included a loophole ("unless the user explicitly asks you to bypass the workflow"). The guardrail needed strengthening and the feasibility of tool-level permission restrictions needed evaluation.

## Decision

1. **Prompt-level guardrails are the primary enforcement mechanism.** A new `## Code Implementation Boundary` section in `base/opencode/agents/planner.md` provides:
   - A hard-rule prohibition against direct code implementation
   - Explicit lists of allowed and prohibited edit types
   - Clear fallback behavior when bypass is requested (never auto-bypass)

2. **`edit: ask` is retained as the permission boundary.** OpenCode's permission model supports only three values for `edit`: `allow`, `ask`, or `deny`. No path-based or pattern-based granularity is available. `edit: ask` already requires user approval for every Planner edit, serving as a practical safety interlock.

3. **No path-based restriction is implemented.** OpenCode's permission model does not support path-based or file-pattern-based edit restrictions. If this becomes available in the future, it should be reassessed.

## Consequences

- Planner cannot edit implementation code without: (a) proposing staged/quick delivery first, and (b) asking for explicit redirect confirmation — never auto-bypassing.
- Allowed edits (docs/ai memory, issue workflow, AGENTS.md) remain available under the existing `edit: ask` workflow.
- Future OpenCode permission model improvements may enable stricter enforcement; revisit if path-based restrictions become available.
- The agents.yml comment documents the boundary reasoning for maintainers.

## Related

- Issue #54: Audit Planner guardrails against direct code implementation
- ADR-0014: Agent permissions live in markdown frontmatter from centralized agents.yml
