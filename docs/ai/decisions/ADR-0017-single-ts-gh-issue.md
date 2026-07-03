# ADR-0017: TypeScript as the Main Language for Tooling and Skill Scripts

**Originally:** 2026-06-23 (Replace Bash/PowerShell gh-issue with Single TypeScript Script)
**Broadened:** 2026-07-02 (Generalized to all tooling and skill scripts)
**Status:** Accepted

## Context

The repository historically maintained parallel Bash and PowerShell implementations for operational scripts — a dual-maintenance burden that created platform-specific edge cases, testing complexity, and synchronization overhead. Three migrations demonstrated the pattern and confirmed its viability:

1. **gh-issue** (Issue #84, 2026-06-23): The shared-task workflow had a Bash script (`gh-issue`) and a PowerShell script (`gh-issue.ps1`) that both called the `gh` CLI. Both delegated token resolution to `gh-app-auth.ts` via subprocess.

2. **Release helpers** (Issue #157, 2026-07-01): Release preparation logic lived in `scripts/release.sh` and `scripts/release.ps1` implementing the same algorithm in different languages.

3. **Skill scripts** (Issue #39, 2026-07-02): Skills needing deterministic helper scripts faced the same question — maintain Bash/PowerShell pairs or standardize on TypeScript.

TypeScript offers: single codebase, cross-platform via `npx tsx`, strong typing, team familiarity, and zero-install execution for consumers with Node.js (already a requirement for OpenCode itself).

## Decision

Adopt TypeScript as the main language for all operational tooling scripts and skill scripts in this repository:

- **Tooling scripts**: All new operational scripts (release, CI, maintenance) should be TypeScript unless explicitly justified otherwise.
- **Skill scripts**: All new skill helper scripts use `.ts` files executed via `npx tsx <script>.ts`.
- **Bash/PowerShell exceptions**: Only when the operation must work without Node.js, or as thin platform-specific wrappers.
- **Existing scripts**: Bash/PowerShell scripts in the repo (installer, QA) remain unchanged — this ADR covers tooling and skill scripts only.
- **Runtime**: `npx tsx` — no build step, no `tsconfig.json` required for standalone scripts.

### Concrete outcomes from each migration

**gh-issue.ts** (Issue #84):
- Single TypeScript script replacing two legacy scripts
- Native `fetch` (Node 18+) against the GitHub REST API — no `gh` CLI dependency
- Direct `import { getValidToken } from './gh-app-auth.ts'` — no subprocess
- Auth order: `GITHUB_TOKEN` → `GH_TOKEN` → `getValidToken()` (cache → refresh → device flow)
- 88 vitest tests under `tests/typescript/gh-issue/`
- See ponytail simplifications below

**release.ts** (Issue #157):
- Standalone TypeScript script using only Node.js built-ins (`fs`, `child_process`, `path`, `process`)
- Replaced and deleted `scripts/release.sh` and `scripts/release.ps1`
- 42 vitest tests under `tests/typescript/release/`
- Shared `scripts/lib/git.ts` helper extracted, eliminating duplicated `execFileSync('git', ...)` options across `release.ts` and `gh-issue.ts`

**ai-memory.ts** (Issue #39):
- First skill helper script in TypeScript (under `base/opencode/skills/`)
- 5 subcommands (`status`, `list-plans`, `list-adrs`, `close-check`, `init`)
- Stdlib-only — no external npm packages
- Embedded templates for `docs/ai/` scaffolding with `--dry-run` support

## Consequences

**Positive:**
- Single codebase per script — no dual maintenance
- TypeScript type checking catches errors at compile time
- Shared utilities emerging organically (e.g., `scripts/lib/git.ts`)
- **2026-07-03 update**: Both `gh-issue.ts` and `ai-memory.ts` establish a convention of an inline one-liner `git` wrapper (`const git = (args, cwd?, t?) => execFileSync('git', args, {encoding:'utf8', cwd, timeout: t}).trim()`) rather than importing from `scripts/lib/git.ts`. A shared skill-script utility library is deferred via `ponytail:` comments for future extraction when more than two skill scripts share a pattern.
- Vitest provides consistent test framework across all TypeScript scripts
- No `gh` CLI dependency for gh-issue — works wherever `npx tsx` runs
- Consuming repositories need Node.js (already required for OpenCode)

**Negative:**
- Requires Node.js and `npx tsx` to run (Bash is available on any Unix system)
- Bash/PowerShell-only environments without Node.js cannot run TypeScript scripts — acceptable since such environments cannot run OpenCode either

## ADRs Affected

- **ADR-0011**: The "keep both scripts in sync" constraint is superseded (single script per tool).
- **ADR-0016**: Auth helper integration is a direct import rather than subprocess.
- Earlier separate ADRs for release migration and skill-script policy were absorbed into this broader decision — their numbers are released for future use.

## Simplification (2026-06-25)

Ponytail audit of the completed gh-issue rewrite found four over-engineering items, all addressed in a single phase:

- **N+1 issue fetching**: `getIssueState`/`getIssueAssigneeCount`/`getIssueFirstAssignee`/`issueHasLabel` now accept a `GitHubIssue` object instead of `issueNumber`. Each command handler calls `getIssue()` once instead of 2–4 times. Eliminates redundant GitHub API calls.
- **Retry simplification**: `api()` retries 5xx once (500ms fixed delay); network errors propagate immediately. Removed exponential backoff, `Retry-After` parsing, and `maxRetries` loop (~28 lines saved).
- **Slugify simplification**: Word-boundary-aware truncation replaced with simple `.slice(0, 60)` (~11 lines saved). Mid-word truncation has no functional impact on branch names.
- **Inline dead abstraction**: `getMissingRequiredLabels` (called in 2 places) inlined; function and tests removed (~12 lines saved).

Plan: `docs/ai/plans/2026-06-25-gh-issue-ponytail-simplify.md`.
