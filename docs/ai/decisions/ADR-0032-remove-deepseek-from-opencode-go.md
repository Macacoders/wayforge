# ADR-0032: Remove DeepSeek from opencode-go model distribution

**Date**: 2026-08-19
**Status**: Accepted

## Context

The `opencode-go` gateway's DeepSeek models (`deepseek-v4-pro`, `deepseek-v4-flash`) are no longer accessible from outside China, making every default install that used them non-functional. The affected surfaces were:

- Provider block: `base/opencode/config/providers/opencode-go-provider-block.jsonc`
- Agent block defaults: `base/opencode/config/agents/balanced-opencode-go-only-agent-block.jsonc` (planner, delivery, quickcode)
- TS CLI defaults and fast preset: `cli/src/lib/providers.ts` (`resolveDefaultModels`, `FAST_MODELS`)
- Interactive wrappers: `install/bootstrap-interactive.sh` / `.ps1` ("faster responses" preset)

All other gateway families (Kimi, Qwen, MiniMax, MiMo, GLM) remain reachable.

## Decision

1. Remove `deepseek-v4-pro` and `deepseek-v4-flash` from the opencode-go provider block entirely.
2. New opencode-go default distribution:
   - Main model (planner, delivery, config default): `minimax-m2.7` with `reasoningEffort: medium` / `textVerbosity: medium`.
   - Default small model, `quickcode` agent, and fast preset (`FAST_MODELS['opencode-go']` and the interactive wrappers' "faster responses" preset): `kimi-k2.7-code`.
3. GLM models (`glm-5`, `glm-5.1`) stay in the provider block as manually-selectable models but are excluded from defaults: their hourly request limits are too low for agent workflows, risking mid-task model switches.
4. Legacy installers (`install/legacy/*`) are intentionally untouched — they are a frozen, deprecated reference surface and still contain deepseek defaults.
5. The `.bats` test case asserting the deepseek fast-preset output was removed (git history preserves it); the remaining provider-agnostic interactive wrapper tests stay.

## Consequences

- Fresh opencode-go installs get a fully reachable model distribution without manual `/model` switches.
- Existing installs pinned to deepseek must run `/model opencode-go/minimax-m2.7` (or reinstall/refresh) — acceptable since those models are unreachable anyway.
- `code` and `quickcode` agents now share `kimi-k2.7-code`; diversity across roles is preserved via MiniMax (planning/delivery), Qwen (research/architect/test), and MiMo (taskanalyst).
- The fast preset for opencode-go now equals the code model rather than a distinct light model — a deliberate simplification given the gateway's current catalog.
