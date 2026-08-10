# ADR-0030: Do Not Adopt TOON for JSON/JSONC Files

## Status

Accepted (2026-07-14)

## Context

Issue #86: Investigate whether TOON (Token-Oriented Object Notation) can replace JSON/JSONC in the `ai-config` repository.

TOON is a compact, indentation-based format designed to reduce token count when data is sent to LLMs. The repository has 20 candidate files:
- 9 tooling-required JSON files (package.json, package-lock.json, tsconfig.json) consumed by npm/TypeScript/Node.js
- 10 JSONC config fragments under `base/opencode/config/` used to generate `opencode.jsonc`/`kilo.jsonc`
- 1 internal tracking file (`installed-projects.json`) used by 3 installer implementations

A two-phase feasibility investigation was conducted (see `docs/ai/reports/toon-feasibility-2026-07-14.md`).

## Decision

Do not adopt TOON for any file in this repository. All 20 candidate files remain in their current JSON or JSONC format.

## Rationale

1. **Zero token benefit.** TOON's value is reducing tokens sent to LLMs. None of the candidate files flow to LLMs — config fragments are embedded in JSONC output parsed by OpenCode/Kilo Code (programs), and `installed-projects.json` is internal tracking.

2. **Hard upstream constraint.** OpenCode and Kilo Code require JSON/JSONC for configuration files. No plugin, hook, or runtime path accepts TOON.

3. **Config fragments are raw text.** All three installers read JSONC fragments as raw text strings and concatenate them. The JSON structure is never parsed. TOON migration changes the storage format while the access pattern stays "read as text" — pure overhead.

4. **Migration cost exceeds benefit.** Medium-High effort across TS CLI, legacy bash, and legacy PowerShell installers; new dependencies; backward compatibility; ongoing conversion overhead — all for zero functional improvement.

5. **Tooling gaps.** No PowerShell TOON library exists. No Bash-native TOON library (requires Node.js).

## Consequences

- No code changes required.
- No new dependencies.
- No backward compatibility concerns.
- The investigation findings are documented in `docs/ai/reports/toon-feasibility-2026-07-14.md` for future reference.
- Reassessment warranted if: OpenCode adds native TOON config support, or a candidate file becomes LLM-facing.

## Related

- **Issue #86**: Original investigation request
- **ADR-0011**: Tokenizer selection (orthogonal — TOON is a file format, not a tokenizer)
- **`opencode-toon-config-plugin`**: Demonstrates TOON's intended use — Markdown rules files → system prompt injection, not config files
