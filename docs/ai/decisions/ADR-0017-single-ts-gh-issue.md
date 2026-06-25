# ADR-0017: Replace Bash/PowerShell gh-issue with Single TypeScript Script

Date: 2026-06-23
Status: Accepted

## Context

Issue #84: The `gh-issue` workflow was previously implemented as two parallel scripts — a Bash script (`gh-issue`) and a PowerShell script (`gh-issue.ps1`) — that both called the `gh` CLI for GitHub API operations. This required maintaining duplicate logic in two languages, keeping them in sync for every change (per ADR-0011), and depending on the `gh` CLI being installed.

Both scripts delegated token resolution to `github-app-auth.ts` (via `npx tsx` subprocess), but all API calls went through `gh` rather than using native HTTP.

## Decision

Replace both legacy scripts with a single TypeScript implementation (`gh-issue.ts`):

- **Runtime**: `npx tsx` — no build step, no `package.json`, no `tsconfig.json`
- **API**: Native `fetch` (Node 18+) against the GitHub REST API — no `gh` CLI dependency
- **Auth**: Direct `import { getValidToken } from './github-app-auth.ts'` — no subprocess
- **Auth order**: `GITHUB_TOKEN` → `GH_TOKEN` → `getValidToken()` (cache → refresh → device flow)
- **Output**: Preserves existing human-readable format by default; `--json` emits structured JSON
- **Operations**: `check`, `labels-check`, `list`, `create`, `claim`, `assign`, `release`, `close`, `prclose`
- **Dropped**: `raw` subcommand (was a passthrough to `gh` CLI) — no longer applicable
- **No compatibility wrappers**: TypeScript is the sole implementation from the start
- **Tests**: `tests/typescript/gh-issue/` (vitest, 88 tests, mocked API)

## Consequences

- Single script to maintain instead of two parallel implementations.
- No `gh` CLI dependency — the script works wherever `npx tsx` runs.
- `github-app-auth.ts` integration is a direct import, not a subprocess call.
- Token resolution is more robust (env vars checked in-process before falling back to device flow).
- The `raw` subcommand (passthrough to `gh issue`) is no longer needed or available.
- Vitest replaces bats/Bash-only tests for gh-issue functionality.
- `buildPRBody()` gracefully falls through to template/default body when `temp/pr-body-<N>.md` doesn't exist (unlike the legacy scripts that required `temp/` to pre-exist).

## ADRs Affected

- **ADR-0011**: The "keep both scripts in sync" constraint is superseded (single script).
- **ADR-0016**: The auth helper integration is now a direct import rather than subprocess; script references updated from `gh-issue`/`gh-issue.ps1` to `gh-issue.ts`.
