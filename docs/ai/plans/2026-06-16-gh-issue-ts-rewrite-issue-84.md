---
status: completed
created: 2026-06-16
phase: 1/1
required_gates:
  test_verdict: true
  memory_update: true
---

# Issue #84 — Rewrite gh-issue as Single TypeScript Script

## Goal

Replace the duplicated Bash and PowerShell `gh-issue` scripts with one portable TypeScript implementation using the GitHub REST API through native `fetch`.

Integration with existing `gh-app-auth.ts` for authentication. No compatibility wrappers — TypeScript is the sole implementation from the start.

Drop the `raw` subcommand.

## Assumptions

- Runtime: `npx tsx` (no build step, no `package.json`, no `tsconfig.json`)
- Tests via `npx vitest run` (vitest 4.1.9 available globally, no local `node_modules` needed)
- Auth: `GITHUB_TOKEN` env → `GH_TOKEN` env → `import { getValidToken } from './gh-app-auth.ts'` (reuses existing cache/refresh/device-flow logic)
- `--json` for structured agent output; `--dry-run` for mutating operations
- No compatibility wrappers — `gh-issue.ts` is the sole implementation
- Drop the `raw` subcommand entirely
- Preserve current human-readable output format unless `--json` is specified

## Scope Classification

| Field | Value |
|---|---|
| **Size** | Moderate |
| **Phase budget** | 1 phase |
| **Phase budget rationale** | All changes are tightly coupled — new script, tests, reference updates, and legacy cleanup form one atomic deliverable. No meaningful sequencing, dependency, or risk boundary between them. |
| **Quick delivery eligible** | No |
| **Split required** | No |

## Key Decisions

- Runtime: TypeScript via `npx tsx`, no build step, no package.json
- Language: TypeScript, no build step
- API: GitHub REST API via native `fetch`
- Auth order: `GITHUB_TOKEN` → `GH_TOKEN` → `getValidToken()` from `gh-app-auth.ts`
- `getValidToken()` handles: cached token → silent refresh → device flow
- Add `--json` for agent-friendly structured output
- Add `--dry-run` for mutating operations
- No compatibility wrappers — TypeScript-only replacement
- Remove `raw` subcommand
- Preserve current human-readable output format unless `--json` is specified

---

# Phase 1 — TypeScript Implementation & Migration

## Scope

### New Script

Create:

```text
base/opencode/skills/shared-task/scripts/gh-issue.ts
```

Implement operations:

- `check`
- `labels-check`
- `list`
- `create`
- `claim`
- `assign`
- `release`
- `close`
- `prclose`

Do not implement:

- `raw`

### Features

Implement:

- `--repo`
- `-R`
- `--json`
- `--dry-run`
- stable exit codes
- stable text output compatible with existing scripts

### Authentication

```typescript
import { getValidToken } from './gh-app-auth.ts';

function resolveToken(): string {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  return await getValidToken(); // cache → refresh → device flow
}
```

### Repository Resolution

Support:

- Explicit `--repo`
- Explicit `-R`
- Automatic detection from git `origin` remote

### Legacy Cleanup

Delete:

```text
base/opencode/skills/shared-task/scripts/gh-issue
base/opencode/skills/shared-task/scripts/gh-issue.ps1
```

### Reference Updates

Update these files to reference `gh-issue.ts` instead of the legacy scripts:

```text
base/opencode/skills/shared-task/SKILL.md
base/opencode/commands/issue.md
base/opencode/permissions/agents.yml
tests/bash/bootstrap_cli.bats
```

## Tests

Create:

```text
tests/typescript/gh-issue/
```

Cover:

- argument parsing
- auth resolution order
- repository resolution
- all operations
- `--json`
- `--dry-run`
- output compatibility
- exit codes
- expected failures

### Failure Cases

Cover:

- missing token
- invalid repository
- issue not found
- issue already assigned
- issue already closed
- missing labels
- insufficient permissions

Mock GitHub API calls in unit tests.

## Acceptance Criteria

1. `npx vitest run` passes
2. `npx tsx base/opencode/skills/shared-task/scripts/gh-issue.ts check` succeeds
3. `npx tsx base/opencode/skills/shared-task/scripts/gh-issue.ts labels-check` succeeds
4. `npx tsx base/opencode/skills/shared-task/scripts/gh-issue.ts list` preserves current human-readable format
5. `--json` returns valid structured JSON
6. Mutating commands support `--dry-run` without side effects
7. `raw` subcommand is absent (not implemented)
8. SKILL.md, issue.md, agents.yml, and bootstrap_cli.bats all reference `gh-issue.ts`
9. Legacy `gh-issue` (Bash) and `gh-issue.ps1` deleted
10. `make check` passes

## Risks

- `prclose` is the most complex operation (PR creation with body generation, protected-branch auto-branching) — careful `fetch` implementation required
- `list` output format must match `gh issue list` output exactly for agent compatibility
- `make check` runs bash-only checks (shfmt, shellcheck) — ensure deletions don't break `make check-bash`

## Validation Strategy

- `npx vitest run` (unit tests with mocked API)
- Manual smoke test: `gh-issue.ts check`
- Manual smoke test: `gh-issue.ts labels-check`
- Manual smoke test: `gh-issue.ts list`
- `make check` (bash lint, duplication checks, test suite)
