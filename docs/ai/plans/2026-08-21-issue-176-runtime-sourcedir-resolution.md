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

Resolve the ai-config source tree (`sourceDir`) at runtime — primarily via `AI_CONFIG_HOME` (set at install time) with a runtime-relative fallback and a clear error when absent — so a relocated/CI-built `bun build --compile` binary never reads a baked-in build-machine path. `--ref` behavior is unchanged.

## Scope Classification

- **Size**: Small
- **Phase budget**: 1
- **Phase budget rationale**: Two identical call sites + one small shared helper + one env override + one bootstrap export; tightly coupled, reviewable as a single deliverable.
- **Quick delivery eligible**: No (compiled-binary correctness cannot be validated locally — `bun` not installed).
- **Split required**: No

## Confirmed decisions

- Runtime API is `process.execPath` (NOT `import.meta.dir`, which resolves to `/$bunfs/root` in compiled binaries; NOT `process.argv0`, which is argv[0] and may be relative).
- Resolution precedence: `AI_CONFIG_HOME` → compiled binary (`path.dirname(process.execPath)` via `process.versions.bun`) → dev (`path.resolve(__dirname, '..', '..', '..')`).
- Missing source tree → clear error + exit(1) (no silent no-op).
- Tracking-file location coupling (`installed-projects.json` written into `sourceDir`) is out of scope; install and uninstall stay consistent by sharing the resolver.
- `--source` CLI flag deferred (AI_CONFIG_HOME chosen).

## Phase 1: Runtime `sourceDir` resolution via `AI_CONFIG_HOME`

**Scope**:

1. Add `resolveSourceDir()` helper (new `cli/src/lib/source-dir.ts`).
2. Replace `cli/src/commands/install.ts:54` and `cli/src/commands/uninstall.ts:84` with the helper.
3. In `install.ts`, when not overridden by `--ref`, validate `base/` exists; on missing, clear error + `process.exit(1)`.
4. `install/bootstrap.sh` + `install/bootstrap.ps1`: set `AI_CONFIG_HOME` to `ROOT_DIR` before invoking the binary (all tiers) and the `npx tsx` fallback.
5. `--ref` clone path unchanged.

**Acceptance criteria**:

- [ ] `install.ts` and `uninstall.ts` no longer derive `sourceDir` from `__dirname`; both use `resolveSourceDir()`.
- [ ] `AI_CONFIG_HOME` is honored as the primary source location.
- [ ] Missing source tree → clear error + exit(1).
- [ ] `--ref` still overrides `sourceDir`.
- [ ] `make check` passes.

**Risks**:

- `bun` absent locally → compiled-binary acceptance criteria cannot be verified here; deferred to author/CI.
- `process.versions.bun` is also true under `bun run` (non-documented dev flow) → would take the execPath branch; negligible.
- Raw-binary-without-`AI_CONFIG_HOME` users get the new error (intended guardrail).

## Validation Strategy

- **Gate**: `make check` (vitest + `tsc --noEmit` + ESLint + Prettier + jscpd).
- **Unit test** (approved): `resolveSourceDir()` precedence — AI_CONFIG_HOME wins / compiled fallback / dev fallback — via `vi.stubEnv` + stubbed `process.execPath`/`process.versions.bun` (~4 cases).
- **Manual (needs `bun`)**: `make cli-binary`, copy binary to temp dir, run `install --repo <tmp> --dry-run` with no `AI_CONFIG_HOME` → clear error; with `AI_CONFIG_HOME=<checkout>` → templates found.

## Decisions To Record

- ADR: runtime `sourceDir` resolution precedence; `process.execPath` is the correct runtime API for `bun build --compile` binaries.
- Note: `--source` flag deferred (AI_CONFIG_HOME chosen).
- Note: tracking-file location coupling explicitly out of scope.
