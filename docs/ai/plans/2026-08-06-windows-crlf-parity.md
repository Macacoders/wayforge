---
status: completed
created: 2026-08-06
phase: 2/2
required_gates:
  test_verdict: true
  architect_review: false
  memory_update: true
---

# Cross-platform parity fixes (Windows == Linux)

## Goal

Make the repo fully testable and correct on **both Linux and Windows**: fix the 3 pre-existing Windows `config-gen` test failures, the local prettier CRLF failure, the missing vitest install, and the phantom "new managed path discovered" noise on Windows refresh — with every fix a behavior-preserving no-op on Linux.

## Scope Classification

- **Size**: Small
- **Phase budget**: 2
- **Quick delivery eligible**: No (batch of distinct fixes incl. one cross-cutting formatting config; `/plan` invoked)

## Cross-Platform Design Constraints (applies to all phases)

- Generated output is always LF via `writeFile`; every file read that feeds generated output is normalized CRLF→LF.
- Manifest paths are posix-only; any path built for manifest comparison is normalized via `posixPath`.
- Symlinks are never assumed available; feature-detected at test time.
- No `process.platform === 'win32'` hardcoding anywhere — runtime detection only (`path.sep`, symlink probe).

## Phase 1: Test & tooling parity

**Scope**:

1. `.prettierrc`: add `"endOfLine": "auto"` (prettier preserves each file's existing EOL).
2. Environment: `npm install` at repo root so vitest 4.1.9 (and all lockfile deps) land in `node_modules`.
3. `cli/src/lib/config-gen.ts` — `readFragment`: normalize `\r\n` → `\n` before the trailing-newline strip (fixes mixed-EOL generated `opencode.jsonc` on Windows).
4. `cli/tests/unit/config-gen.test.ts`: module-level symlink-capability probe; the two symlink tests use `it.skipIf(!canSymlink)`.

**Acceptance criteria**:

- [ ] `npx vitest run` green on Windows with the repo's own `vitest.config.ts` (no temp-config workaround); config-gen suite fully passes incl. comma-newline test and (on capable platforms) symlink tests
- [ ] `npx prettier --check` green on the CRLF working tree
- [ ] `npx tsc --noEmit` from `cli/` exit 0
- [ ] Generated `opencode.jsonc` from a temp install contains no `\r` (LF-only output)
- [ ] Linux semantics unchanged: `endOfLine: auto` accepts LF, `readFragment` no-op on LF, symlink tests still run

**Risks**:

- prettier `auto` flags files with mixed EOLs inside one file (normalizes to first-line style); our index is uniformly LF and Windows checkouts uniformly CRLF, so this cannot trigger.
- `npm install` may touch `package-lock.json` if the lock drifted — verify `git status`; if modified, review and commit the lock change deliberately.

**Validation strategy**:

1. `npm install`
2. `npx vitest run` (full suite)
3. `npx prettier --check .`
4. `npx tsc --noEmit` (from `cli/`)
5. Temp install; grep generated `opencode.jsonc` for `\r`

## Phase 2: Installer refresh polish

**Scope**:

1. `cli/src/lib/manifest.ts`: export the existing `posixPath` helper.
2. `cli/src/commands/install.ts`: in the 4 discovery loops (agents, commands, skills, plugins), build `relPath` via `posixPath(path.relative(base, f))` so Windows subpaths (backslash) match manifest posix paths.

**Acceptance criteria**:

- [ ] Fresh install + refresh on a **temp** Windows repo: second run logs zero "new managed path discovered" for existing paths; `.ai-config-managed` byte-identical after refresh; all 8 agents still have `permission:` frontmatter
- [ ] Same scenario on Linux: identical behavior; `posixPath` is a no-op for `/`
- [ ] `C:\DEV\ai-config`'s own `.ai-config-managed` (56 paths) untouched during verification (temp repos only)
- [ ] `npx vitest run` + `npx tsc --noEmit` from `cli/` still green

**Risks**:

- `relPath` consumers build targets with `path.join(repo, relPath)` — posix `/` is valid on both platforms.
- Exporting `posixPath` widens manifest.ts API surface minimally; no behavior change.

**Validation strategy**:

1. Temp-repo e2e twice (install → refresh): assert no phantom logs, manifest byte-stable, permissions injected
2. `npx vitest run` + `npx tsc --noEmit` (cli/)
3. Do **not** run `make check` end-to-end (bash-only targets require bash); Node-only targets only

## Decisions To Record

- New ADR-0031: "Cross-platform parity conventions" — (1) file reads feeding generated output normalize CRLF→LF; (2) manifest paths posix-only via `posixPath`; (3) symlink-dependent tests skip when the platform lacks symlink privilege; (4) prettier `endOfLine: auto`.
- No `architecture.md` changes (no boundary/invariant change).
