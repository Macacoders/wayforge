# ADR-0018: Adopt npm workspaces

## Status
Accepted (2026-07-01)

## Context
The repository had three separate `node_modules` directories:
1. Root — TypeScript tooling (typescript, vitest, tsx, @types/node)
2. `cli/` — CLI package tooling (typescript, vitest, @types/node) + CLI deps (commander, fs-extra)
3. `.opencode/` — OpenCode plugin runtime (managed by OpenCode)

The root and `cli/` `node_modules` duplicated ~45 packages each (typescript, vitest, @types/node with identical version ranges). This was visual noise and unnecessary disk usage, though all three were gitignored.

## Decision
Adopt npm workspaces. Root `package.json` declares `"workspaces": ["cli"]`. Shared devDependencies (typescript, vitest, @types/node) live only in root and hoist to a single `node_modules/`. CLI keeps only its unique deps (commander, fs-extra, @types/fs-extra).

Root `vitest.config.ts` scopes root tests to `tests/typescript/**/*.test.ts`. `cli/vitest.config.ts` scopes CLI tests to `tests/**/*.test.ts` and isolates CLI from root vitest config.

CLI test fixture paths were updated to resolve from `__dirname` instead of `process.cwd()` to work correctly when run via `npm -w cli test`.

The `open` package was added to root `devDependencies` — it was previously an undeclared optional dependency of `gh-app-auth.ts`, satisfied by stale transitive resolution.

## Consequences
- Single `npm install` at root installs everything.
- Root `node_modules/`: 59 packages (shared). `cli/node_modules/`: 7 packages (platform-native deps that cannot hoist).
- Root `tsconfig.json` (bundler, noEmit, agent scripts) and `cli/tsconfig.json` (CommonJS, emit, CLI binary) remain separate and unchanged — they target different environments.
- `.opencode/node_modules/` is unaffected (OpenCode-managed).
