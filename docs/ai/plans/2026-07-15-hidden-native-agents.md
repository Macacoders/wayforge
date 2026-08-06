---
status: completed
created: 2026-07-15
phase: 1/1
required_gates:
  test_verdict: true
---

# Hide native OpenCode agents in generated config

**Issue**: [#173](https://github.com/Macacoders/ai-config/issues/173)

## Goal

Add `"hidden": true` entries for 4 native OpenCode agents (`build`, `general`, `explore`, `plan`) to the `"agent"` block in generated `opencode.jsonc` / `kilo.jsonc`, across all providers and runtimes.

## Scope Classification

- **Size**: Small
- **Phase budget**: 1
- **Quick delivery eligible**: Yes

## Phase 1: Add hidden agents to all fragment files + free-tier logic

**Scope**:

1. Append 4 hidden entries to end of each existing agent fragment (5 files)
2. Create new `free-tier-agent-block.jsonc` with only the 4 hidden entries
3. Update `buildAgentBlockJson()` in `cli/src/lib/config-gen.ts` — free-tier returns new fragment
4. Update `build_agent_block_json()` in `install/legacy/bootstrap-legacy.sh` — same free-tier change
5. Update free-tier unit test in `cli/tests/unit/config-gen.test.ts`
6. Verify integration tests

**Acceptance criteria**:

- [ ] All 5 existing fragment files end with the 4 hidden agent entries
- [ ] New `free-tier-agent-block.jsonc` exists with only the 4 hidden entries
- [ ] `buildAgentBlockJson()` returns the free-tier fragment for free-tier providers
- [ ] `build_agent_block_json()` returns the free-tier fragment for free-tier providers
- [ ] Free-tier generated config contains `"agent":` with hidden entries
- [ ] Unit tests pass (`npx vitest run`)
- [ ] Integration tests pass (TS ↔ bash parity)
- [ ] All 6 provider combinations produce valid JSONC with hidden entries at END of agent block

**Risks**:

- Free-tier test currently asserts `not.toContain('"agent":')` — must flip to `toContain`
- JSONC formatting (indentation, commas) must stay consistent between TS and bash

**Validation strategy**:

1. `npx vitest run` — TS unit tests
2. `make check` — full QA (lint, format, type-check, tests, duplication)
3. Manual dry-run: `./install/bootstrap.sh --repo /tmp/test-repo --dry-run --providers free-tier`

## Validation Strategy

- Run `npx vitest run` for unit tests
- Run `make check` for full QA
- Manual dry-run with free-tier to verify output

## Decisions To Record

- Hidden agents are in JSONC fragments (not generated dynamically) — consistent with existing pattern
- Free-tier now has its own fragment instead of empty string
