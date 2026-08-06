---
hidden: true
---

# Shared Invariants

## Repository Boundary

- Establish REPOSITORY_ROOT before repository search, review, or handoff work; use `git rev-parse --show-toplevel` when needed.
- After `Repository root:` is confirmed in-session, reuse it for subsequent planning, review, and child handoffs unless an explicit cwd/repository change or failed validation indicates the root may be stale.
- Re-run root/repo discovery only when invalidated by explicit context changes or command evidence conflicts with the current root.
- Keep Glob, Grep, Read, Edit, and Bash operations inside REPOSITORY_ROOT by default.
- Do not inspect parent directories, sibling repositories, `$HOME`, or filesystem-wide paths unless the user explicitly approves the external path.
- Include `Repository root:` in every handoff so child agents know the boundary.

## Progressive Disclosure

### Canonical (planner)

Load context in this order:

1. User task and `README.md`.
2. `docs/ai/README.md` if present.
3. Active plan under `docs/ai/plans/` only when continuing.
4. `architecture.md` only for architecture/data flow/module boundary/deployment/public contract changes.
5. ADRs under `docs/ai/decisions/` only when a decision may conflict with or extend prior decisions.
6. Logs under `docs/ai/logs/` only for historical continuity or unresolved regressions.

Before reading an optional memory file, check whether it exists. If absent, skip it silently.
Do not paste whole documents into handoffs. Pass paths, reasons to load them, and a compact summary of confirmed decisions.

### Simplified (subagents)

For subagent use: treat the handoff brief as the primary context. Load only references listed in the brief plus minimal directly relevant files. Do not load architecture, ADR, logs, or broad repository documentation unless the brief explicitly names them or a blocking fact requires them. Keep reports compact.

## Ponytail Ladder

### 7-rung ladder

1. Does this need to exist? (YAGNI) → skip it
2. Already in this codebase? → reuse it
3. Stdlib does it? → use it
4. Native platform feature? → use it
5. Installed dependency solves it? → use it
6. One line? → one line
7. Only then: write the minimum that works

### Full ladder directive

Apply the reuse-first ponytail ladder before any new logic: 1) YAGNI — skip it; 2) reuse existing code in this codebase; 3) use the stdlib; 4) use native platform features; 5) use installed dependencies; 6) prefer a one-liner; 7) only then write the minimum that works. When deferring a simpler solution (for example, adding a helper when a one-liner would suffice), require a `ponytail:` comment explaining why, enabling future debt harvesting.

## Reuse Expectation

When a change touches repeatable logic, require a concise reuse expectation in handoffs: first decide if it is needed at all (rung 1), then inspect reasonable existing patterns, utilities, scripts, helpers, commands, tests, or conventions within task scope (rung 2) before creating new logic.
