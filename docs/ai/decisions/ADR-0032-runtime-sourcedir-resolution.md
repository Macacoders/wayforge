# ADR-0032: Runtime sourceDir resolution via AI_CONFIG_HOME

**Date**: 2026-08-21
**Status**: Accepted
**Amended**: 2026-08-24 — `resolveSourceDir()` gains a location-based `../share/ai-config` rung relative to `path.dirname(process.execPath)`, guarded by `base/` existence. This supersedes the earlier note that the compiled-binary runtime-relative fallback was deferred.
**Amended**: 2026-08-25 — Decision re-enumerated to the three actual rungs (incl. the `base/`-existence guard), the "runtime-relative fallback deferred" sentence dropped, the retired `install/bootstrap.{sh,ps1}` reference removed, and the tracking-file consequence corrected to cross-reference ADR-0035.

## Context

The compiled CLI (`bun build --compile`) derived its template source root from `path.resolve(__dirname, '..', '..', '..')`. Bun bakes `__dirname` in at compile time, so a relocated or CI-built binary read templates from the build machine's absolute checkout path (silently installing whatever existed there). `import.meta.dir`/`import.meta.url` are not a fix — in a compiled binary they resolve to the virtual `/$bunfs/root`, not the on-disk executable location. `process.argv0` is just `argv[0]` and may be relative.

## Decision

1. The template source root is resolved at runtime by `resolveSourceDir()` (`cli/src/lib/source-dir.ts`) with this three-rung precedence:
   1. `process.env.AI_CONFIG_HOME` if non-empty (primary; an explicit override).
   2. A location-based fallback: `path.join(path.dirname(process.execPath), '..', 'share', 'ai-config')`, used only when a `base/` directory exists there. This lets a compiled binary at `<prefix>/bin/ai-config` find `<prefix>/share/ai-config/base` with no env var.
   3. Dev fallback: `path.resolve(__dirname, '..', '..', '..')` (checkout via `npx tsx`).
2. The one-shot installer places the snapshot at `<prefix>/share/ai-config`; the compiled binary resolves it via rung 2 without an env var. `AI_CONFIG_HOME` remains available as an explicit override.
3. When the resolved source tree is absent (no `base/` directory, non-`--ref` path), `install` raises a clear error and exits 1 rather than silently installing nothing.
4. `--ref` continues to override `sourceDir` with a cloned checkout (unchanged).

## Consequences

- A relocated/CI-built binary no longer reads a baked build-machine path; it honors `AI_CONFIG_HOME`, else resolves the snapshot relative to its own executable location (rung 2) and falls back to the dev checkout path (rung 3), erroring clearly when no source tree is found.
- `AI_CONFIG_HOME` — already the established `_ai_config_root` convention in the bash/PowerShell profile snippets — remains the explicit source-location signal shared by the shell helpers and the TS CLI, but is no longer required for the installed binary.
- A `--source` CLI flag is deliberately deferred (env var is sufficient; YAGNI).
- The `installed-projects.json` tracking file was subsequently moved out of `sourceDir` into the per-user prefix (see ADR-0035); it no longer lives in the source tree.
