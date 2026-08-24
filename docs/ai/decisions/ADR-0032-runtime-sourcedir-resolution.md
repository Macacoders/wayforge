# ADR-0032: Runtime sourceDir resolution via AI_CONFIG_HOME

**Date**: 2026-08-21
**Status**: Accepted
**Amended**: 2026-08-24 — `resolveSourceDir()` gains a location-based `../share/ai-config` rung relative to `path.dirname(process.execPath)`, guarded by `base/` existence. This supersedes the earlier note that the compiled-binary runtime-relative fallback was deferred.

## Context

The compiled CLI (`bun build --compile`) derived its template source root from `path.resolve(__dirname, '..', '..', '..')`. Bun bakes `__dirname` in at compile time, so a relocated or CI-built binary read templates from the build machine's absolute checkout path (silently installing whatever existed there). `import.meta.dir`/`import.meta.url` are not a fix — in a compiled binary they resolve to the virtual `/$bunfs/root`, not the on-disk executable location. `process.argv0` is just `argv[0]` and may be relative.

## Decision

1. The template source root is resolved at runtime by `resolveSourceDir()` (`cli/src/lib/source-dir.ts`) with this precedence:
   1. `process.env.AI_CONFIG_HOME` if non-empty (primary; set at install time).
   2. Dev fallback: `path.resolve(__dirname, '..', '..', '..')` (checkout via `npx tsx`).
2. A compiled-binary runtime-relative fallback is deliberately deferred to the standard build-flow issue (which owns the installed-location contract); this issue only removes the compile-time-path dependency.
3. `install/bootstrap.sh` and `install/bootstrap.ps1` export `AI_CONFIG_HOME` to their resolved `ROOT_DIR` before invoking the binary (all tiers) and the `npx tsx` fallback, so the source root is communicated at install time.
4. When the resolved source tree is absent (no `base/` directory, non-`--ref` path), `install` raises a clear error and exits 1 rather than silently installing nothing.
5. `--ref` continues to override `sourceDir` with a cloned checkout (unchanged).

## Consequences

- A relocated/CI-built binary no longer reads a baked build-machine path; it honors `AI_CONFIG_HOME`, else falls back to the dev checkout path and errors clearly when the source tree is missing.
- `AI_CONFIG_HOME` — already the established `_ai_config_root` convention in the bash/PowerShell profile snippets — is now the single source-location signal shared by the shell helpers and the TS CLI.
- A `--source` CLI flag is deliberately deferred (env var is sufficient; YAGNI).
- The `installed-projects.json` tracking-file location (written into `sourceDir`) is unchanged and out of scope for this fix; install/uninstall stay consistent because both use `resolveSourceDir()`.
