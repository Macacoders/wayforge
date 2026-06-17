# Plan: Fix OpenCode config — issue #70

**Status**: completed
**Issue**: [#70](https://github.com/Macacoders/ai-config/issues/70)
**Date**: 2026-06-16

## Goal

Populate missing opencode-go model defaults, wire agent permissions from `agents.yml` into agent markdown frontmatter during bootstrap, and remove the fast/thorough agent preset system.

## Phases

### Phase 1: Populate opencode-go model-level options ✅
Add `options` blocks to 6 assigned opencode-go models; leave other 9 as `{}`.

### Phase 2: Wire agent permissions + remove agent presets ✅
- Call `sync_agents_tree_with_permissions` during bootstrap for fresh install and manifest refresh
- Remove `--agent-preset`, all related functions, and `agent-preset-template.jsonc`
- Simplify `build_agent_block_json()` to balanced-only logic

### Phase 3: Update tests and validation ✅
- Rewrite 3 tests in `bootstrap_cli.bats` that used `--agent-preset`
- Fix reinstall test to check permission frontmatter instead of byte-for-byte comparison
- Update `bootstrap_interactive.bats` and both interactive installer scripts
- Remove preset logic from `bootstrap.ps1` and `bootstrap-interactive.ps1`
- `make check` passes (bash, powershell, tests, duplication)

## Decisions

- ADR-0013: Per-agent model configuration via `options` at agent level
- ADR-0014: Agent permissions in markdown frontmatter from centralized `agents.yml`
- ADR-0015: Remove agent presets
