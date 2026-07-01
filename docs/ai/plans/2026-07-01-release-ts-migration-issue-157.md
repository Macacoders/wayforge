# Plan: Migrate release helper scripts to TypeScript — Issue #157

**Created:** 2026-07-01
**Status:** Approved / Phase 1 in progress

## Goal

Create a single `scripts/release.ts` that replaces both `scripts/release.sh` and `scripts/release.ps1`, produces identical behavior, adds test coverage, and removes the now-redundant shell scripts.

## Assumptions

- Standalone implementation using only Node.js built-ins (`fs`, `child_process`, `path`).
- No imports from `cli/src/lib/` or `cli/` dependencies.
- Root-level `tsconfig.json` will be updated to include `scripts/**/*.ts`.
- Executable via `npx tsx scripts/release.ts` and passes `tsc --noEmit`.
- Existing shell scripts will be deleted, not kept.
- `.github/workflows/release.yml` is out of scope.

## Scope Classification

| Dimension | Value |
|-----------|-------|
| **Size** | `single-phase` |
| **Phase budget** | 1 phase |
| **Phase budget rationale** | Single reviewable deliverable: one TypeScript file + tests + doc update + cleanup. All changes are tightly coupled. |
| **Quick delivery eligible** | No |
| **Split required** | No |

## Phases

### Phase 1: Create `scripts/release.ts`, add tests, update RELEASE.md, delete shell scripts

**Scope:**

1. Create `scripts/release.ts` with full feature parity:
   - CLI args: `--version <semver>` (required), `--dry-run` (flag), `--help`
   - SemVer validation
   - Clean working tree check (`git status --porcelain`)
   - Branch check (`git rev-parse --abbrev-ref HEAD` — must be `develop`)
   - Update `VERSION` file
   - Update `CHANGELOG.md` (insert new entry after header, add version link at bottom)
   - Create annotated git tag (`git tag -a v<version>`)
   - Dry-run mode that logs without side effects
2. Update root `tsconfig.json` to include `scripts/**/*.ts`
3. Delete `scripts/release.sh` and `scripts/release.ps1`
4. Create tests under `tests/typescript/release/` using vitest:
   - Argument parsing
   - SemVer validation (valid, invalid, edge cases)
   - Git status/branch checks (mocked)
   - VERSION file update
   - CHANGELOG.md update logic
   - Dry-run mode (no side effects)
5. Update `RELEASE.md`:
   - Replace shell script references with TypeScript equivalent
   - Update all code examples to use `npx tsx scripts/release.ts`
6. Run `tsc --noEmit` to verify type correctness
7. Run `npx vitest run` to confirm tests pass

**Acceptance criteria:**
- `scripts/release.ts` exists and is executable via `npx tsx scripts/release.ts`
- All original functionality present: SemVer validation, clean-tree check, branch check, VERSION update, CHANGELOG update, tag creation, dry-run, help
- `scripts/release.sh` and `scripts/release.ps1` are deleted
- `tsc --noEmit` passes with the updated `tsconfig.json`
- `npx vitest run` passes with new tests under `tests/typescript/release/`
- `RELEASE.md` documents the TypeScript script as the only approach

**Risks:**
- CHANGELOG.md parsing logic must handle both new-file and existing-entries scenarios
- Git mocking in tests requires careful `child_process` mocking

## Validation Strategy

| Step | Command |
|------|---------|
| Type check | `npx tsc --noEmit` |
| Unit tests | `npx vitest run` |
| Dry-run smoke test | `npx tsx scripts/release.ts --version 0.2.0 --dry-run` |

## Decisions To Record

- ADR-0021: Release helper scripts migrated from Bash/PowerShell to standalone TypeScript
- Existing shell scripts deleted as part of migration

## Status

- [x] Plan approved
- [x] Phase 1 complete
- [x] ADR created (ADR-0021)
- [x] Plan closed / memory updated
