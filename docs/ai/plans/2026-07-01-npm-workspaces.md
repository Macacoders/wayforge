# Plan: Adopt npm workspaces

**Created**: 2026-07-01
**Status**: complete

## Goal
Convert to npm workspaces — eliminate duplicated `node_modules` between root and `cli/` by making root the workspace root with `cli` as a workspace member.

## Changes
- Root `package.json`: added `"workspaces": ["cli"]`, scripts, `open` dep
- `cli/package.json`: removed typescript, vitest, @types/node devDeps; removed inline vitest config
- `vitest.config.ts` (root): scopes root tests to `tests/typescript/**/*.test.ts`
- `cli/vitest.config.ts`: scopes CLI tests, isolates from root config
- `cli/tests/unit/config-gen.test.ts`: `process.cwd()` → `__dirname`
- `cli/tests/unit/permissions.test.ts`: `process.cwd()` → `__dirname`

## Decisions
ADR-0018 — Adopt npm workspaces
