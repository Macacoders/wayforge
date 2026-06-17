# ADR-0013: Model options belong at provider model level only

**Date**: 2026-06-16
**Status**: Accepted

## Context

The OpenCode config schema permits `options` objects at both the agent level (within `AgentConfig`) and the model level (within `ProviderConfig.models`). However, OpenCode documentation examples show `reasoningEffort`, `textVerbosity`, `thinking`, and similar model-specific parameters only under `provider.models.*`, not in agent definitions. Agents use `temperature` as their model-tuning parameter.

The 4 balanced agent block JSONC files contained `options` objects with `reasoningEffort` and `textVerbosity` at the agent level, duplicating (and sometimes conflicting with) model-level defaults in provider blocks.

## Decision

1. **Remove `options` from all agent block JSONC files.** Agent blocks define only `model`, `steps`, and similar agent-level properties. Model-specific options belong exclusively in provider model blocks.

2. **Provider model blocks are the single source of truth** for `reasoningEffort`, `textVerbosity`, and other model-tuning parameters. The values in `openai-provider-block.jsonc`, `github-copilot-provider-block.jsonc`, and `opencode-go-provider-block.jsonc` serve as authoritative defaults for their respective models.

3. **The laberit-only agent block** already omitted `options` and remains unchanged.

## Consequences

- 4 agent block files simplified — `options` blocks removed, leaving only `model` and `steps`
- Generated `opencode.jsonc` matches OpenCode documentation conventions (no agent-level `options`)
- Model options are configured once in provider blocks, not duplicated across agents
- Some minor option differences are normalized (e.g., openai code agent now uses model default textVerbosity=medium instead of agent-specified low). The model defaults are reasonable for all use cases
