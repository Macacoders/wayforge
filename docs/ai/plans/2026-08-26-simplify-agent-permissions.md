---
status: completed
created: 2026-08-26
phase: 2/2
required_gates:
  test_verdict: true
  architect_review: true
  memory_update: true
---

# Simplify agent permissions to coarse allow + deny-list model

## Goal

Collapse the per-command `bash` allow-lists in `base/opencode/permissions/agents.yml` into a coarse model — `read: allow`, `bash: "*" allow` + short deny-list, `external_directory` boundary, and a normalized `edit` matrix — while preserving `task:` subagent gating. Record the change in the ADRs.

## Context

The enumerated `bash` allow-lists (git inspection + ~30-line test-runner matrix, duplicated across agents) exist only to suppress prompts for safe commands. The coarse model allows `bash` by default (`"*": allow`) and denies a short list of known-dangerous prefixes — prompting on every benign command (`rg`/`ls`/`cat`) is too slow, and destructive commands are still gated by the deny-list plus user-profile permissions. This drifts the model the opposite direction of PR #194 (four-tier expansion, +265 lines) and supersedes it. ADR-0009/0014 constrain `agents.yml` to flat mappings parsed by three dependency-free line-scanners (TS CLI + legacy awk/pwsh), so no YAML anchors are used.

## Decisions (locked)

- **`read: allow`** for all 8 agents (was unset).
- **`edit` matrix:** `code`/`quickcode` = `allow`; `planner`/`delivery`/`research`/`test` = `ask`; `architect`/`taskanalyst` = `deny` (read-only, per ADR-0025).
- **`bash` allow + deny-list** (all agents): `"*": allow` first (allow-by-default; prompting on every `rg`/`ls`/`cat` is too slow), then `"sudo*"`, `"rm -rf*"`, `"git push --force*"`, `"git push -f*"` = `deny`. Last-match-wins ordering; destructive commands are also gated by user-profile permissions.
- **`external_directory`** (all agents): `"*": deny`, `"/tmp/**": allow` (read/write exception — integration tests use `/tmp`).
- **`task:` gating preserved verbatim:** planner/delivery allow `research/code/quickcode/test/taskanalyst/architect` + `*` deny; all other agents `task: deny`.
- **Only `agents.yml` + `permissions.test.ts` + ADRs touched**; `opencode.jsonc` generation untouched.

## Assumptions

- `external_directory` lives per-agent in `agents.yml` (rendered into frontmatter), validated against OpenCode schema (`AgentConfig.permission` includes `read` and `external_directory`).
- Authored against `develop` on a fresh branch (not the current `#188` branch).
- Flat-YAML / no-anchor / full-line-comment-only contract preserved so all three scanners render identical output.

## Phases

### Phase 1: Rewrite `agents.yml` + update permission guards
- Rewrite all 8 agent blocks per the locked decisions above; remove the obsolete `# ponytail: resolved` duplication comment; add a short header comment documenting the parse contract + deny-list rationale.
- Update `cli/tests/unit/permissions.test.ts`: replace `"npm test*": allow` / `edit: allow` assertions with guards for `read: allow` present, `"*": allow` first, deny-list entries, `external_directory`, and the edit matrix.

**Acceptance:** `npx vitest run cli/tests/unit/permissions.test.ts` passes; `make check` clean; installer dry-run + real self-install render all 8 `.opencode/agents/*.md` frontmatter blocks byte-consistent with source; no anchors / column-0 comments below `agents:`.

**Risks:** `bash: allow` default broadens exposure relative to `ask`; the deny-list is inherently incomplete (bypassable) — mitigated by the `edit` matrix + `external_directory` boundary; OS-level sandbox and user-profile permissions remain the stronger documented alternative.

### Phase 2: ADR + memory updates
- New **ADR-0036** "Simplify agent permissions to coarse allow + deny-list model": records granularity change, `bash: "*" allow` + deny-list, edit matrix, `read: allow`, `external_directory` boundary, and supersedes the enumerated-allow-list approach (and the direction of PR #194 / ADR-0035-four-tier).
- Amend **ADR-0014** with a cross-reference to ADR-0036; note in **ADR-0004** that quickcode's "allowlisted validation commands" phrasing is superseded; monthly log entry.

**Acceptance:** ADRs consistent; no stale references to removed command allow-lists; monthly log updated.

## Validation Strategy

- `npx vitest run` (full) and `make check` (type-check/lint/format/dup).
- Installer `--dry-run` then real self-install; verify 8 generated frontmatter blocks byte-match `agents.yml`.
- `grep -rn "npm test\|git status\|allowlist" base/opencode/permissions/ docs/ai/decisions/` — confirm no stale enumerated-command references.

## Decisions To Record

- ADR-0036 (new), ADR-0014 (amended), ADR-0004 (noted).
- **Architect review required** (auth/security boundary change — authorization). Invoke `architect` `review-only` before finalizing Phase 1.
- **Post-completion follow-up (after both phases approved):** comment on PR #194 and issue #186 explaining the superseding direction; close/reject PR #194.
