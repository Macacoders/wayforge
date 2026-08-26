# ADR-0014: Agent permissions live in markdown frontmatter from centralized agents.yml

**Date**: 2026-06-16
**Status**: Accepted
**Amended**: 2026-08-26 — the permission model in `agents.yml` is now the coarse allow + deny-list model described in ADR-0036 (superseding the four-tier ADR-0035).

## Context

Agent permission rules were defined in `base/opencode/permissions/agents.yml` but never wired into the installed configuration. The generated `opencode.jsonc` only contained `"permission": { "skill": { "*": "allow" } }`. The `managed_sync.sh` library already had functions to render permissions from YAML into agent markdown frontmatter, but they were not called during bootstrap.

## Decision

1. Agent permissions are rendered into each agent's `.opencode/agents/*.md` frontmatter during bootstrap, sourced from `base/opencode/permissions/agents.yml`

2. Permissions go in markdown frontmatter (not the jsonc) to keep the jsonc clean and because permissions are logically part of the agent's definition

3. The centralized `agents.yml` is the single source of truth for all agent permissions

4. Permissions are injected during:
   - Fresh installs (via `sync_agents_tree_with_permissions`)
   - Manifest-aware refreshes (via a dedicated permission-injection loop after agent syncs)

## Consequences

- `opencode.jsonc` remains compact — no agent-specific permission section needed
- Permissions can be updated by editing `agents.yml` and re-running bootstrap
- The `render_agent_permission_block` and `render_agent_with_central_permissions` awk-based functions in `managed_sync.sh` handle the YAML-to-frontmatter conversion without external dependencies
