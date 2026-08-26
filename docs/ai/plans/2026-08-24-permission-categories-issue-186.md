---
status: completed
created: 2026-08-24
phase: 1/1
required_gates:
  test_verdict: false
  architect_review: true
  memory_update: true
---

# Plan: Permission category refactor — issue #186

**Status**: completed
**Issue**: [#186](https://github.com/Macacoders/ai-config/issues/186)
**Date**: 2026-08-24 (completed same day; all 6 acceptance criteria met)

## Goal

Refactor `base/opencode/permissions/agents.yml` into a documented, category-driven permission model that eliminates approval noise for safe read-only and validation commands across all 8 agents, while preserving the three-scanner parsing contract (TS + legacy awk + legacy pwsh) and the current security posture (catch-all ask for everything else).

## Confirmed Decisions (Discovery)

- Safe read-only commands: allowed for **all 8 agents**
- Validation commands: allowed for **all 8 agents**
- Mechanism: hand-maintained flat YAML with a documented category convention (option a); generator script rejected
- New allowlists must be strict supersets of current per-agent permissions
- `gh-issue.ts` / `gh-app-auth.ts` helpers stay exclusive to planner/delivery; planner `task:` block untouched
- No pattern-matched deny rules; destructive tier = catch-all ask, documented as deliberate
- Exact safe-read-only seed list finalized in phase diff; ambiguous cross-shell aliases (`find`, `grep`) excluded by default

## Phases

### Phase 1: Category-based permission refactor

**Architect review**: required (review-only) before implementation — security/permission boundary + format contract shared by three parsers.

Scope:
- Comment header in `agents.yml`: four-tier convention (**safe-read-only** allow, **validation** allow, **modification** catch-all ask, **destructive** deliberately not pattern-matched) + ADR-0009 three-scanner constraint note.
- Rewrite all 8 agent blocks in canonical order: catch-all → safe-read-only → validation → agent-specific extras → `task:` block. Convert `research`/`code`/`test` from scalar `bash: ask` to full maps.
- Safe-read-only seed: `git status/log/diff/show/branch/ls-files/rev-parse/remote get-url*`, `cat*`, `head*`, `tail*`, `ls*`.
- Validation tier: existing npm/pnpm/yarn/pytest/ruff/mypy/cargo/go/make set replicated verbatim to all agents.
- Extend `cli/tests/unit/permissions.test.ts`: all 8 agents render non-empty blocks + representative spot-checks (e.g., `research` contains `git log*: allow`).
- Author ADR in `docs/ai/decisions/`: category convention, superset guarantee, hand-maintained choice, no-deny-list rationale, three-scanner compatibility reaffirmed.

Acceptance criteria:
1. Per-agent allowlists verified as supersets of old ones (pattern diff reviewed in git evidence).
2. One-shot cross-scanner parity evidence: TS `renderAgentPermissionBlock`, awk `render_agent_permission_block`, and the pwsh equivalent produce byte-identical blocks for all 8 agents over the new `agents.yml`. (`cli/tests/integration/run.sh` alone is insufficient — it strips `permission:` blocks before diffing.)
3. Extended unit tests green; `npx vitest run` passes. Guards per agent: (a) first `bash:` child is `"*": ask`, (b) rendered output contains no `#`, (c) tier representatives present (e.g., `research` has `git log*: allow`, `architect` has `pytest*: allow`).
4. `make check` fully clean.
5. Installer `--dry-run` against temp repo renders injected `permission:` frontmatter without errors.
6. ADR-0035 merged under `docs/ai/decisions/`; agents.yml header references it.

Format constraints (from architect review):
- Comments only above the `agents:` line or as indented full-line `#` lines inside agent blocks. Never column 0 below `agents:` (terminates section in all three scanners); never trailing on key/value lines (not stripped by legacy scanners).
- `"*": ask` must remain the FIRST bash key in every agent block (OpenCode last-match-wins resolution).
- Every allow glob ends with `*`.

Risks: glob typos over-permissioning (mitigated by superset diff + architect pass); legacy scanner divergence on restructure (mitigated by one-shot parity check + structural unit guards; permanent CI harness rejected as tooling overhead on a deprecated legacy path — re-run instructions recorded in ADR-0035).

## Validation Strategy

Existing validation only (no new suites): `npx vitest run`, `cli/tests/integration/run.sh`, `make check`, installer `--dry-run` smoke. Unit-test extension is part of approved acceptance criteria. Superset verification is a review step against git history, not a permanent test.

## Decisions To Record

- ADR-0035 (`docs/ai/decisions/ADR-0035-four-tier-bash-permission-categories.md`): category convention; hand-maintained flat YAML (generator rejected); destructive = catch-all ask, no deny patterns; catch-all-first ordering invariant; comment-placement format constraints; superset guarantee; explicit residual-risk acceptance (prefix-glob chaining/redirection bypass, `git branch*` local-destructive variants under edit-denied agents, project-hook execution under validation tier); ADR-0009 lineage reaffirmed; ADR-0014 unchanged.
- No `architecture.md` change (source-of-truth boundary unchanged). Monthly log entry at close.

## Architect Review Outcome (2026-08-24)

**Verdict: APPROVE-WITH-CHANGES** (confidence 0.85). All three scanners verified line-by-line as behaviorally identical on flat reordered maps with indented full-line comments; scalar-to-map conversion semantically safe (flat action ≡ `"*": action`); security posture widens quantitatively, not qualitatively — prefix-glob chaining/redirection bypass already accepted in planner/delivery/quickcode posture. Approval conditional on: comment-placement + ordering constraints with unit guards, corrected cross-scanner parity criterion (integration harness normalizes permission blocks away), trailing-`*` hygiene, and conscious residual-risk recording in ADR-0035. Required changes are folded into Phase 1 scope above.
