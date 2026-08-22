# ADR-0034: Make-only QA entry point

**Date**: 2026-08-22
**Status**: Accepted

## Context

The documented full QA gate is `make check`. Issue #177 moved the installer to a make-first workflow, and issue #188 exposed that the active QA path still had one bash dependency: `qa/check-duplication`, a forwarding wrapper around `npx jscpd`. On Windows (the primary dev machine), GNU Make 4.4.1 runs recipes via its sh-or-cmd fallback and could not spawn the bash wrapper at all (`CreateProcess ... failed` Error 2), leaving `make check` permanently red. An npm-script layer (`package.json` scripts as the QA entry) was considered as an alternative.

## Decision

1. **The QA entry point stays make-only.** npm-scripts are rejected as a redundant second entry layer; #177's make-first direction stands. All active QA targets must be runnable directly by GNU Make without requiring bash.
2. Forwarding wrappers on the *active* path are inlined into the `Makefile` (ponytail rung 2). `qa/check-duplication` was deleted; `check-duplication:` now invokes `npx --yes jscpd` directly as a single physical recipe line (backslash-newline continuations behave differently between make's sh and cmd fallbacks), and `check:` recurses via `@$(MAKE) check-duplication`.
3. jscpd arguments are byte-for-byte identical to the deleted wrapper: pattern `**/*.ts`; ignores `.git`, `node_modules`, `base`; threshold 8; min-lines 8; reporters console. Thresholds/ignores must not be tuned to force green.
4. The GNU-Make-on-Windows prerequisite is documented in AGENTS.md and README.md (`choco install make`) rather than abstracted away in tooling.
5. Deprecated targets that still call `qa/*` scripts (bash/powershell/bats/pester/coverage paths) are explicitly out of scope: they are not on the active QA path.

## Consequences

- `make check` passes end-to-end on Windows for the first time (verified 2026-08-22: vitest 257 passed / 2 skipped; tsc + ESLint + Prettier green; duplication 6.97% < 8%).
- The last bash dependency is gone from the active QA path; remaining `qa/` consumers are deprecated surfaces only.
- POSIX behavior verified 2026-08-22 by running the exact recipe under Git Bash (MSYS bash as `sh`): quoted globs passed through verbatim (no premature expansion) and the check exited 0 at 6.97% dup — identical to the Windows run. Only shell-sensitive surface is quoted-arg parsing, which is POSIX-specified; native-Linux GNU make/npx remain formally unexercised but low-risk.
- Future QA surface growth (#177 direction) extends the Makefile, not package.json scripts.
