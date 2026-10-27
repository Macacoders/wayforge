# ADR-0035: Four-Tier Bash Permission Categories

**Date**: 2026-08-24
**Status**: Superseded by ADR-0036
**Superseded**: 2026-08-26 — superseded in full by ADR-0036 ("Simplify agent permissions to coarse allow + deny-list model"). Retained as historical record; superseded in place (not renumbered) because "ADR-0035" collides with ADR-0035 (one-shot CLI installer).

## Context

Issue #186: agents prompted for approval on benign read-only commands (`git log`, `git diff`, `cat`, …) while the per-agent allowlists had grown asymmetric — planner/delivery carried git-inspection rules, quickcode carried the validation set, taskanalyst/architect had only `git status*`, and research/code/test were bare `bash: ask`. Closing the gap by hand would have meant maintaining eight divergent blocks with no documented convention.

Two hard constraints shaped the solution:

- **Three-scanner parsing contract**: `base/opencode/permissions/agents.yml` is consumed by three dependency-free line-scanners — `cli/src/lib/permissions.ts` (TypeScript CLI) plus the legacy awk/pwsh renderers in `install/legacy/lib/managed_sync-legacy.sh` / `.ps1`. None of them resolves YAML anchors or merge keys, consistent with ADR-0009's dependency-free line-oriented parsing principle. The YAML must stay plain, flat block mappings.
- **Security posture**: everything not explicitly allowed must keep falling through to `ask`.

An architect review of the draft plan returned **APPROVE-WITH-CHANGES**: the scanners were verified line-by-line as behaviorally identical on flat reordered maps with indented full-line comments, and the scalar-to-map conversion was confirmed semantics-preserving. The review's required changes were folded into the implementation: comment-placement and rule-ordering constraints enforced by unit guards, a corrected cross-scanner parity criterion (the integration harness strips `permission:` blocks before diffing, so it cannot prove parity), trailing-`*` glob hygiene, and explicit residual-risk recording — which this ADR provides.

## Decision

1. `agents.yml` documents a four-tier category convention, replicated in every agent's bash map in this physical order:
   - **Modification catch-all** — `"*": ask`; unmatched commands prompt.
   - **Safe-read-only** — allow for all 8 agents (read-only git inspection plus `cat*`, `head*`, `tail*`, `ls*`); every glob ends with `*`.
   - **Validation** — allow for all 8 agents (npm/pnpm/yarn test/lint/typecheck/build, pytest, ruff check, mypy, cargo test, go test, make test), duplicated verbatim in every block.
   - **Destructive** — deliberately NOT pattern-matched. There is no deny list; the catch-all ask already covers destructive commands.

2. Superset guarantee: every allow rule present for an agent before the refactor remains present after it. Verified per agent against git history during implementation; the only behavioral delta was converting research/code/test from scalar `bash: ask` to full maps (see item 4).

3. The file stays hand-maintained flat plain YAML. A generator script was rejected: it adds tooling for a rarely-edited file whose duplication is small, deliberate, and justified in-file by the ADR-0009 scanner constraint. ADR-0014 (permissions rendered into markdown frontmatter from centralized `agents.yml`) is unchanged.

4. Rule-order invariant: `"*": ask` MUST remain the first bash key in every block. OpenCode resolves permissions last-match-wins, so later allow rules override the catch-all. The scalar-to-map conversion (`bash: ask` ≡ `"*": ask` map) is semantics-preserving.

5. Format constraints, parser-safe for all three scanners (enforced by unit guards in `cli/tests/unit/permissions.test.ts`):
   - Comments inside agent blocks must be full-line `#` lines indented inside the block; the scanners strip them.
   - Never a comment at column 0 below the `agents:` line — any line whose indent is ≤ the `agents:` indent terminates the section in all three scanners.
   - Never a trailing comment on a key/value line — the legacy scanners do not strip it, so it would corrupt the parsed value.
   - Every allow glob ends with `*`.

6. Residual risks consciously ACCEPTED, not fixed:
   - Prefix-glob chaining bypass: `cat x && <arbitrary command>` matches `cat*`.
   - Redirection makes "read-only" commands write-capable (`cat > f`).
   - `git branch*` includes local-destructive variants (`-D`, `-m`) under edit-denied agents; impact is local-only, no remote reach.
   - The validation tier executes project-controlled hooks (package-manager scripts, make targets) under all 8 agents.
   - Whether OpenCode splits compound commands before permission matching is undocumented — do not assume protection.

7. At the time of this decision, the shared-task helpers `gh-issue.ts` /
   `gh-app-auth.ts` were exclusive to planner and delivery; no other agent
   gained them. `gh-app-auth.ts` was removed on 2026-10-27.

## Cross-Scanner Parity Evidence

One-shot check performed 2026-08-24 over the refactored `agents.yml`, all 8 agents:

- TypeScript `renderAgentPermissionBlock` ≡ awk `render_agent_permission_block`: **byte-identical ×8**.
- PowerShell `Get-AgentPermissionBlock` ≡ TypeScript after leading-whitespace normalization: **×8**, with a uniform −1 space shift on every captured line.

The pwsh shift is a pre-existing quirk: `install/legacy/lib/managed_sync-legacy.ps1` line ~521 captures `$line.Substring($targetAgentIndent + 1)`, stripping one leading space more than the TS `line.slice(targetIndent)` / awk `substr(line, indent + 1)` equivalents. The result is structurally valid YAML. It is NOT fixed — the legacy path is deprecated per ADR-0033.

Re-run instructions for future structural changes to `agents.yml`: render each agent block through the three functions (`renderAgentPermissionBlock`, `render_agent_permission_block`, `Get-AgentPermissionBlock`) and compare — TypeScript vs awk must be byte-identical; pwsh vs TypeScript compared modulo leading whitespace — before merging. This is deliberately not a CI harness: permanent tooling on the deprecated legacy path was rejected as overhead.

## Consequences

- Approval noise disappears for safe read-only and validation commands across all 8 agents; unknown or dangerous commands still prompt via the catch-all.
- The file roughly tripled in length (~140 to ~430 lines), dominated by the deliberately duplicated validation tier; the header comment in `agents.yml` is the normative companion documentation and must stay consistent with this ADR.
- Structural regressions (reordered catch-all, surviving comments, missing tier representatives, helper leakage) are caught by unit tests rather than review alone.
- Cross-scanner parity relies on the one-shot check above plus the re-run discipline; the integration harness cannot detect permission-block divergence because it normalizes `permission:` blocks away.
- The `edit` dimension is normalized independently of bash tiers: every agent prompts before file writes (`edit: ask`), only architect/taskanalyst hard-deny; role differentiation lives in bash scope and task delegation, never in write elevation (delivery/quickcode had drifted to `allow` via Issue #181's wholesale copy of quickcode's block).

## Alternatives Considered

- **Generator script producing the per-agent blocks** — Rejected: adds build tooling and indirection for a rarely-edited file; hand-maintained duplication with an explanatory header is cheaper overall.
- **Deny rules for destructive patterns** (`rm*`, `git push --force*`, …) — Rejected: high maintenance burden and false safety, since chained commands (`cat x && rm -rf y`) bypass any prefix deny list anyway; the catch-all ask provides strictly better coverage.
- **Narrowing `git branch*` for edit-denied agents** (e.g., excluding `-D`/`-m` variants) — Deferred: prefix globs cannot express negative suffixes, so the alternatives (enumerating safe subforms or dropping the rule) break the verbatim-replication simplicity that makes the file auditable; accepted under item 6 instead.
