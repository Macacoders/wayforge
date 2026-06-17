# ADR-0015: Remove agent presets (fast/thorough)

**Date**: 2026-06-16
**Status**: Accepted

## Context

The installer (`install/bootstrap.sh`) supported `--agent-preset fast|thorough|balanced` to select different step counts and reasoning effort levels for agents. The implementation was complex: dedicated template file (`agent-preset-template.jsonc`), two functions (`build_agent_block_json_from_preset`, `render_agent_preset_template`), 16 positional parameters, and CLI argument parsing.

The preset system injected agent-level `options` (reasoningEffort, textVerbosity) for openai/github-copilot providers, which duplicated the model-level defaults already present in the provider blocks.

## Decision

1. Remove `--agent-preset` from `install/bootstrap.sh` and `install/bootstrap.ps1`
2. Delete `agent-preset-template.jsonc` and all related functions
3. Remove agent preset menus from interactive installers
4. `build_agent_block_json()` uses only balanced provider-logic (selecting the appropriate static agent block based on enabled providers)

## Rationale

- The preset system added complexity without sufficient value
- Balanced agent blocks already provide sensible defaults for all providers
- Users who need custom step counts or model options can edit the generated config directly
- Removing presets simplified the codebase by ~200 lines across bash and PowerShell

## Consequences

- `--agent-preset` no longer accepted; bootstrap defaults to balanced configuration
- Bats tests that tested preset behavior were rewritten to test balanced defaults
- PowerShell and bash interactive installers no longer offer an agent preset menu
