---
status: completed
created: 2026-06-15
phase: 1/1
required_gates:
  test_verdict: false
  memory_update: true
---

# Token Counter Plugin — Issue #45

**Created**: 2026-06-15
**Status**: Complete ✅ — handoff for session tracker at `docs/ai/plans/2026-06-15-session-token-tracker-handoff.md`
**Issue**: [#45](https://github.com/Macacoders/ai-config/issues/45)

## Goal

Create a token-count estimation plugin for OpenCode that scans AI workflow files (agents, commands, skills, templates, docs) and reports per-file + total token counts.

## Approach

JavaScript OpenCode plugin under `base/opencode/plugins/token-counter/`, exposing a `count_tokens` tool. Enabled/disabled via `opencode.jsonc` → `plugin` array. Local/offline token counting via `gpt-tokenizer`.

## Phases

### Phase 1: Tokenizer Spike ✅
Evaluate `js-tiktoken`, `tiktoken`, `gpt-tokenizer`. Produce ADR with recommendation.
→ Result: `gpt-tokenizer` v3.4.0 chosen (pure JS, lowest overhead, most recent). ADR-0011 created.

### Phase 2: Implement Plugin ✅
Build plugin, register tool, update installer, document.

## Decisions
- [ADR-0011](decisions/ADR-0011-tokenizer-selection.md): `gpt-tokenizer` with `cl100k_base` encoding

## Changed Files
- `base/opencode/plugins/token-counter/package.json` (new)
- `base/opencode/plugins/token-counter/index.js` (new)
- `base/opencode/plugins/token-counter/README.md` (new)
- `.opencode/package.json` (added `gpt-tokenizer`)
- `opencode.jsonc` (added `plugin` array)
- `install/bootstrap.sh` (plugin propagation)
- `install/bootstrap.ps1` (plugin propagation)
- `install/lib/managed_sync.sh` (plugin path resolution)
- `install/lib/managed_sync.ps1` (plugin path resolution)
- `docs/ai/decisions/ADR-0011-tokenizer-selection.md` (new)
