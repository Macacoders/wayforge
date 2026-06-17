# Issue #84 — Rewrite gh-issue as Single TypeScript Script

## Goal

Replace `base/opencode/skills/shared-task/scripts/gh-issue` (Bash, 413 lines) and `gh-issue.ps1` (PowerShell, 396 lines) with a single portable `gh-issue.ts` that uses the GitHub REST API via native `fetch` instead of the `gh` CLI. Drop the `raw` subcommand. Use `tsx` as the runtime.

## Scope Classification

| Field | Value |
|---|---|
| **Size** | Moderate |
| **Phase budget** | 2 phases |
| **Phase budget rationale** | Phase 1 introduces a new TS toolchain + script + tests — the risky deliverable. Phase 2 is mechanical wiring/cleanup that depends on Phase 1 being approved. |
| **Quick delivery eligible** | No — new toolchain, cross-cutting reference changes, script deprecation |
| **Split required** | No |

## Decisions

- **Runtime**: TypeScript via `tsx` (no build step) — aligns with TS-first migration
- **API**: GitHub REST API via native `fetch` over `gh` CLI — eliminates shell quoting bugs, improves portability, type-safe
- **Auth**: `GH_CONFIG_DIR` YAML → `GITHUB_TOKEN` env → `gh auth token` fallback chain
- **`raw` subcommand**: Removed (escape hatch not needed for workflow automation)
- **Toolchain**: `package.json` + `tsconfig.json` + Vitest added to ai-config root

## Phases

### Phase 1: TypeScript toolchain + `gh-issue.ts` implementation + tests

**Scope:**
- Create `package.json` (type: module, devDeps: `typescript`, `@types/node`, `vitest`)
- Create `tsconfig.json` for type-checking scripts under `base/`
- Create `vitest.config.ts`
- Write `base/opencode/skills/shared-task/scripts/gh-issue.ts` implementing all 9 operations (`check`, `labels-check`, `list`, `create`, `claim`, `assign`, `release`, `close`, `prclose`) via GitHub REST API
- Implement auth via `GH_CONFIG_DIR` YAML host file parsing → fallback `GITHUB_TOKEN` env var → fallback `gh auth token`
- Implement repo derivation from git remote or `--repo`/`-R`
- Write Vitest tests under `tests/gh-issue/` covering each operation

**Acceptance criteria:**
1. `npx tsx <script> check` succeeds against the ai-config repo
2. `npx tsx <script> labels-check` succeeds
3. `npx tsx <script> list` outputs the same format as current scripts
4. All operations (`create`, `claim`, `assign`, `release`, `close`, `prclose`) functional and tested
5. `--repo` and `-R` flags work, default to origin remote
6. `GH_CONFIG_DIR` auth path works (verified against the existing `.gh-config`)
7. `npx vitest run` passes with all gh-issue tests
8. Error handling: missing auth, closed issues, already-assigned, etc. produce clear error messages
9. The `raw` subcommand is not implemented

**Risks:**
- YAML parsing in pure TS (no dep) — can use a minimal regex-based approach since the GH_CONFIG_DIR YAML is simple
- GitHub API rate limits during testing

### Phase 2: Wiring — update references, remove old scripts

**Scope:**
- Update `base/opencode/permissions/agents.yml` — remove the `.ps1*` allow line (the existing `gh-issue*` already covers `gh-issue.ts*`)
- Update `base/opencode/commands/issue.md` — replace references to `gh-issue`/`gh-issue.ps1` with `gh-issue.ts`
- Update `base/opencode/skills/shared-task/SKILL.md` — same
- Update `docs/ai/architecture.md` — reflect single TS script, REST API over `gh` CLI
- Update `docs/ai/backlog/README.md` — same
- Update `tests/bash/bootstrap_cli.bats` — change test paths from `gh-issue` (Bash script) to `gh-issue.ts`
- Delete `base/opencode/skills/shared-task/scripts/gh-issue` (Bash)
- Delete `base/opencode/skills/shared-task/scripts/gh-issue.ps1` (PowerShell)
- Run `npx vitest run` to confirm tests still pass
- Run `make check` to confirm existing validation still passes

**Acceptance criteria:**
1. No remaining references to `gh-issue` (Bash) or `gh-issue.ps1` in commands, skills, docs, or permissions
2. All references point to `gh-issue.ts` (or `gh-issue.ts*`)
3. Old Bash and PowerShell scripts are deleted
4. `make check` passes
5. `npx vitest run` passes

## Validation Strategy

- **Per-phase**: Each phase has its own validation commands listed in acceptance criteria
- **Integration**: After Phase 2, run the full `make check` QA suite + `npx vitest run`
- **Manual**: Run a live `check`, `labels-check`, and `list` against this repo to verify end-to-end

## Status

**Blocked** by #27 — must wait until the PR creation workflow standardisation PR is merged before starting implementation.

### Dependency chain

- #16 ← blocked by #84
- #84 ← blocked by #27
- #85 ← blocked by #84 + #70
