# ADR-0037: Add `troubleshooter` Chat Agent for Command-First Diagnostics

**Date**: 2026-08-31
**Status**: Proposed

## Context

Users frequently paste errors, failing builds, or unexpected behavior and need safe, step-by-step diagnostic guidance before any planning or implementation decision is made. The existing `planner` agent is optimized for feature planning and phased delivery; `triage` classifies pasted errors and recommends a workflow but does not itself walk through diagnostics. There is no dedicated agent that provides command-first, non-destructive troubleshooting guidance within the OpenCode chat surface.

Adding a `troubleshooter` agent fills this gap: a `mode: primary` chat agent that users can invoke with `/troubleshooter` when they want to diagnose a concrete problem safely, one diagnostic command at a time.

## Decision

1. **New agent**: Add `troubleshooter` as a `mode: primary` agent documented in `base/opencode/agents/troubleshooter.md`. It is reachable via `/troubleshooter` in the OpenCode chat surface.

2. **Non-default / opt-in**: The default agent remains `planner`. `troubleshooter` must be explicitly selected by the user (via `/troubleshooter` or by planner routing); it does not replace or intercept the default agent slot.

3. **Default model (no frontmatter override)**: The `troubleshooter.md` agent doc contains no per-agent `model:` frontmatter. It receives the provider's main model at runtime, assigned in each non-free-tier provider agent block in `opencode.jsonc` following the ADR-0013 pattern (agent blocks define only `model` + `steps`).

4. **Mandatory `agents.yml` permission entry**: A `troubleshooter` entry is added to `base/opencode/permissions/agents.yml` under the ADR-0036 coarse allow + deny-list model (ADR-0014 contract unchanged — flat YAML, no anchors, full-line comments only):
   - `read: allow` — diagnostic work is read-mostly.
   - `edit: ask` — allow file inspection but prompt before writes.
   - `bash: "*": allow` plus the standard deny-list (`sudo*`, `rm -rf*`, `git push --force*`, `git push -f*`) — diagnostics need shell access; dangerous prefixes are denied.
   - `external_directory: "*": deny`, `/tmp/**": allow` — standard boundary.
   - `task: deny` — the troubleshooter diagnoses; it does not invoke subagents.
   The installer auto-discovers `.md` agent files via `syncAgentsTreeWithPermissions` and exits with an error if a permission entry is missing for any discovered agent, so the `agents.yml` entry is mandatory for the agent to be usable.

5. **No architect boundary review required**: `troubleshooter` is an internal workflow-surface addition (new agent doc + permission block + provider model blocks). It does not cross the 6 boundary categories defined in `base/opencode/agents/architect.md`, and architect.md explicitly states that architect review should not be invoked merely for documentation changes.

## Consequences

- Users gain a dedicated, safe diagnostic agent without altering the default agent or existing workflows.
- The permission model is read-mostly with `edit: ask` — appropriate for diagnostic investigation that may need to inspect but not freely modify files.
- No installer code changes are required beyond the existing `syncAgentsTreeWithPermissions` mechanism discovering the new `.md` file and requiring a matching `agents.yml` entry.
- Provider agent blocks follow the established ADR-0013 pattern (model + steps only), keeping `opencode.jsonc` generation unchanged.

## Alternatives Considered

- **Add diagnostic mode to `planner`**: Rejected — `planner` is the default agent optimized for planning; conflating diagnosis with planning would dilute both roles and make the default agent heavier.
- **Use `triage` skill alone**: Rejected — `triage` classifies errors and recommends a workflow path but does not itself walk through step-by-step diagnostics; it is a classifier, not a diagnostic agent.
- **Make `troubleshooter` a subagent**: Rejected — diagnostic guidance is a user-facing chat interaction, not an internal routing step; `mode: primary` with `/troubleshooter` is the natural fit.
