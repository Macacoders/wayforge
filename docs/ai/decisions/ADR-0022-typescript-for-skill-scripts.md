# ADR-0022: Adopt TypeScript as the Main Language for Skill Scripts

**Date:** 2026-07-02
**Status:** Accepted

## Context

OpenCode skills sometimes need deterministic helper scripts for repeatable operations. The `shared-task` skill already uses TypeScript (`gh-issue.ts`, `gh-app-auth.ts`), while other skills lack scripts entirely or would historically have used Bash/PowerShell pairs. The `ai-memory` skill (Issue #39) needs a scriptable helper, raising the question of which language to standardize on.

Maintaining Bash/PowerShell pairs for every script doubles maintenance burden, creates platform-specific edge cases, and makes testing more complex. TypeScript offers:

- Single codebase, cross-platform (Windows/macOS/Linux) via `npx tsx`
- Strong typing reducing runtime errors
- Existing pattern in the `shared-task` skill
- Team familiarity (current active development uses TypeScript)
- `npx tsx` provides zero-install execution for consuming repositories that have Node.js

## Decision

Adopt TypeScript as the main language for OpenCode skill scripts across the repository. All new skill scripts should be written in TypeScript. Bash/PowerShell script pairs should only be used when explicitly justified (e.g., the operation must work without Node.js, or the script is a thin shell wrapper for platform-specific behavior).

## Consequences

- New skill scripts use `.ts` files executed via `npx tsx <script>.ts`
- Consuming repositories need Node.js (already a dependency for OpenCode itself)
- Bash/PowerShell-only environments without Node.js cannot run TypeScript scripts — but such environments cannot run OpenCode either, making this acceptable
- Existing Bash/PowerShell scripts in the repo (installer, QA) remain unchanged — this ADR covers skill scripts only
- Future skill development benefits from shared TypeScript utilities and type safety
- **2026-07-03 update**: Both `gh-issue.ts` and `ai-memory.ts` establish a convention of an inline one-liner `git` wrapper (`const git = (args, cwd?, t?) => execFileSync('git', args, {encoding:'utf8', cwd, timeout: t}).trim()`) rather than importing from `scripts/lib/git.ts`. A shared skill-script utility library is deferred via `ponytail:` comments for future extraction when more than two skill scripts share a pattern.

## Alternatives Considered

- **Bash + PowerShell pairs**: Rejected due to doubled maintenance, platform-specific bugs, and testing complexity
- **Python**: Viable but introduces a third language; team and repo are TypeScript-focused
- **Go / compiled binary**: Adds build step and cross-compilation complexity not justified by current script complexity
