---
status: completed
created: 2026-08-21
phase: 1/1
required_gates:
  test_verdict: true
  architect_review: false
  memory_update: true
---

# Issue #176: Resolve template source at runtime instead of compile-time path

## Goal

Make the compiled CLI resolve its template `sourceDir` at runtime instead of baking `__dirname` in at compile time — with an honest, minimal precedence: `AI_CONFIG_HOME` override → dev `__dirname` fallback. The `e71616d` attempt is corrected by dropping the dead `process.versions.bun`/`process.execPath` branch, restoring install/uninstall symmetry with warn-and-continue, and stopping bootstrap from clobbering an explicit `AI_CONFIG_HOME`. `--ref` behavior is unchanged.

## Scope Classification

- **Size**: Small
- **Phase budget**: 1
- **Phase budget rationale**: Four tiny production edits + one test trim + one doc amendment, all touching the same concept; a single reviewable deliverable.
- **Quick delivery eligible**: No (staged path elected; compiled-binary correctness still not locally verifiable — `bun` absent).
- **Split required**: No
- **Architect review**: Not required (no architecture-boundary change; ADR amended, not a new boundary).

## Confirmed decisions

- Drop the `process.versions.bun` / `path.dirname(process.execPath)` branch. It is a wrong discriminator (`bun run` also sets `process.versions.bun`) and, even when it fires, `dirname(process.execPath)` (e.g. `dist/`) does not contain `base/` — so it never resolves templates for the real build layout.
- Final precedence: `AI_CONFIG_HOME` (non-empty) → `path.resolve(__dirname, '..', '..', '..')` (dev/`npx tsx`).
- Runtime-relative fallback for the compiled binary is **deferred to the standard build-flow issue**, which owns the installed-location contract. This issue only removes the compile-time-path dependency.
- Missing source tree: `install` → clear error + exit(1); `uninstall` → warn-and-continue (skip tracking-entry removal, still remove managed files).
- Bootstrap sets `AI_CONFIG_HOME` as a **default**, not an overwrite.
- `--source` CLI flag remains deferred (env var is sufficient).

## Phase 1: Simplify `resolveSourceDir` to two honest rungs; restore uninstall symmetry

**Scope**:

1. `cli/src/lib/source-dir.ts` — remove the `process.versions.bun` / `path.dirname(process.execPath)` branch; final precedence `AI_CONFIG_HOME` → dev `__dirname`.
2. `cli/src/commands/install.ts` — no functional change (existing `base/` guard stays); confirm `--ref` path untouched.
3. `cli/src/commands/uninstall.ts` — warn-and-continue when resolved `sourceDir` has no `base/`: log warning, skip `removeTrackingEntry`, still remove managed files.
4. `install/bootstrap.sh` — `export AI_CONFIG_HOME="${AI_CONFIG_HOME:=$ROOT_DIR}"`; `install/bootstrap.ps1` — set `$env:AI_CONFIG_HOME` only when unset.
5. `cli/tests/unit/source-dir.test.ts` — trim to the final-precedence cases (env set / empty-string env / dev fallback); delete `bun`/execPath cases.
6. Docs — amend `ADR-0032` (precedence + retract the `process.execPath`-as-API claim + note runtime-relative fallback deferred); update plan frontmatter/phase and monthly log.

**Acceptance criteria**:

- [ ] `resolveSourceDir()` has exactly two branches; no `process.versions.bun` or `process.execPath` reference remains.
- [ ] `install.ts` still errors clearly when the source tree is missing (non-`--ref`).
- [ ] `uninstall.ts` warns and continues (does not exit) when the source tree is missing; managed files are still removed.
- [ ] `--ref` path unchanged end-to-end.
- [ ] `bootstrap.sh`/`.ps1` no longer overwrite an explicit user `AI_CONFIG_HOME`.
- [ ] `make check` passes (vitest + `tsc --noEmit` + ESLint + Prettier + jscpd).

**Risks**:

- Dropping the execPath branch removes a (non-functional) compiled-binary fallback; a raw binary without `AI_CONFIG_HOME` now relies on the clear error. This is the intended guardrail and matches the issue's stated scope.
- `bun` absent locally → compiled-binary acceptance still deferred to author/CI.

## Validation Strategy

- **Gate**: `make check`.
- **Unit** (approved): `resolveSourceDir()` precedence — `AI_CONFIG_HOME` wins / empty-string treated as unset / dev fallback (~3 cases via `vi.stubEnv`).
- **Manual dry-run**: `npx tsx cli/src/index.ts install --repo <tmp> --dry-run` with `AI_CONFIG_HOME` unset → clear error; with `AI_CONFIG_HOME=<checkout>` → succeeds; `uninstall` with stale `AI_CONFIG_HOME` → warning, files still removed.
- **Deferred**: compiled-binary relocation test (needs `bun`).

## Decisions To Record

- `ADR-0032` amended: precedence `AI_CONFIG_HOME` → dev `__dirname`; `process.execPath`/`process.versions.bun` rejected as the compiled-binary discriminator; runtime-relative fallback deferred to the build-flow issue.
- Tracking-file coupling: uninstall adopts warn-and-continue (not hard-error).
