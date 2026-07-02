# ADR-0021: Release helper scripts migrated to standalone TypeScript

**Status:** Accepted  
**Date:** 2026-07-01  
**Driver:** Issue #157 — convert release helper scripts from Bash/PowerShell to TypeScript

## Context

The release preparation logic lived in two parallel scripts (`scripts/release.sh` and `scripts/release.ps1`) implementing the same algorithm in different languages. This dual-maintenance burden was inconsistent with the project's ongoing TypeScript migration for tooling (precedent: Issue #131, `gh-issue.ts`).

## Decision

1. **Create `scripts/release.ts`** as a standalone TypeScript script using only Node.js built-ins (`fs`, `child_process`, `path`, `process`).
2. **Delete** `scripts/release.sh` and `scripts/release.ps1` — the TS script fully replaces both.
3. Use **standalone** approach: no imports from `cli/src/lib/` or any `cli/` dependencies, as those libraries are installer-specific and do not cover release operations.
4. Add **vitest test coverage** under `tests/typescript/release/`.
5. Update **`RELEASE.md`** to document only the TypeScript approach.

## Consequences

**Positive:**
- Single codebase for release logic — no dual maintenance
- TypeScript type checking catches errors at compile time
- 42 unit tests provide regression coverage that the shell scripts lacked
- No new npm dependencies (tsx, typescript, vitest, @types/node were already present)

**Negative:**
- Requires Node.js and `npx tsx` to run (vs. Bash which is available on any Unix system)
- Precedent for future script migrations

**Risk:**
- None identified beyond the pre-existing `tsc --noEmit` error from `gh-app-auth.ts` (missing `open` module)

## Related

- Issue #157
- ADR-0017 (single TypeScript gh-issue.ts) — precedent for standalone tool scripts
- Issue #131 (installer TypeScript migration) — broader migration context

## Amendments

### 2026-07-02 — `--set-version` convention

The flag was renamed from `--version` to `--set-version` to avoid conflicting with the universal CLI convention where `--version` prints the tool version. The old `--version` flag was an anti-pattern inherited from the shell scripts.

### 2026-07-02 — Shared git helper

A shared `scripts/lib/git.ts` helper was extracted to wrap `execFileSync('git', ...)` calls. Both `release.ts` and `gh-issue.ts` now import from it, eliminating duplicated options objects and establishing a pattern for future standalone TypeScript tooling scripts.
