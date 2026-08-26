# ADR-0036: Simplify Agent Permissions to Coarse Allow + Deny-List Model

**Date**: 2026-08-26
**Status**: Accepted

## Context

ADR-0035 (four-tier bash permission categories) expanded `base/opencode/permissions/agents.yml` from ~140 to ~430 lines by enumerating safe read-only and validation commands per agent, under a `"*": ask` catch-all with no deny-list. The enumerated allow-lists existed only to suppress prompts, and the expansion made the file harder to audit while PR #194 pushed it further in the same direction (+265 lines).

Prompting on every benign command (`rg`/`ls`/`cat`) is too slow, and the enumerated model's main value — suppressing approval noise — is achieved more simply by inverting the default to `allow` and denying a short list of known-dangerous prefixes. Destructive commands remain gated by the deny-list plus the user's shell/profile permissions.

The three-scanner parsing contract from ADR-0009/ADR-0014 is unchanged: `agents.yml` stays flat YAML (no anchors/merge keys), full-line comments only, parsed identically by the TypeScript CLI (`cli/src/lib/permissions.ts`) and the legacy awk/pwsh `managed_sync` renderers.

## Decision

1. **`read: allow`** for all 8 agents (previously unset).

2. **`bash` allow-by-default + deny-list** for all 8 agents, last-match-wins:
   - `"*": allow` first (prompting on every benign command is too slow);
   - `"sudo*"`, `"rm -rf*"`, `"git push --force*"`, `"git push -f*"` = `deny`.
   `git push --force*` is intentionally broad so it also catches `--force-with-lease`. Destructive commands are additionally gated by the user's shell/profile permissions.

3. **`external_directory` boundary** for all 8 agents: `"*": deny`, `"/tmp/**": allow` (read/write exception — integration tests use `/tmp`).

4. **`edit` matrix**:
   - `code` / `quickcode` = `allow` — these are the two implementation agents; writing files is their job, so write-prompts are pure friction.
   - `planner` / `delivery` / `research` / `test` = `ask`.
   - `architect` / `taskanalyst` = `deny` (read-only, per ADR-0025).

5. **`task:` gating preserved verbatim**: planner/delivery allow `research`/`code`/`quickcode`/`test`/`taskanalyst`/`architect` with `"*": deny`; all other agents `task: deny`.

## Supersedes

This ADR supersedes **ADR-0035 (four-tier bash permission categories)** in full: the enumerated allow-list model with its `"*": ask` catch-all is replaced by the coarse allow + deny-list model above. It also supersedes the direction of PR #194 (four-tier expansion, +265 lines).

ADR-0035-four-tier is superseded in place (Status → "Superseded by ADR-0036") rather than renumbered, because the "ADR-0035" number already collides with ADR-0035 (one-shot CLI installer). Renumbering would churn that unrelated ADR; supersede-in-place preserves the historical record with a one-line status change.

## Consequences

- `agents.yml` shrinks from ~430 to ~134 lines; the model is auditable in one glance instead of eight divergent blocks.
- Benign commands no longer prompt; known-dangerous prefixes are denied. The deny-list is inherently incomplete (bypassable via chained commands) — mitigated by the `edit` matrix, the `external_directory` boundary, and the user's shell/profile permissions.
- `edit: allow` for code/quickcode restores write autonomy for the two implementation agents (it had drifted to `ask` during the ADR-0035 normalization); planner/delivery/research/test still prompt on writes, and architect/taskanalyst remain hard-denied.
- The header comment in `agents.yml` is the normative companion documentation and records the deny-list rationale.

## Residual Risks & Follow-Ups

- The deny-list is prefix-based and bypassable (`sudo` aliases, chained commands); OS-level sandbox and user-profile permissions remain the stronger documented control.
- Non-blocking test follow-ups (raised by the test agent, deferred): a cross-scanner parity test for the legacy pwsh renderer (currently unexercised), and a `task:` gating unit assertion.

## Alternatives Considered

- **Enumerated allow-lists (ADR-0035 / PR #194 direction)** — Rejected: verbatim duplication across 8 blocks is high maintenance with no security benefit over a deny-list once `allow` is the default.
- **Renumber ADR-0035-four-tier to a free number** — Rejected: churns the unrelated ADR-0035 (one-shot CLI installer); supersede-in-place preserves history with a one-line status change.
