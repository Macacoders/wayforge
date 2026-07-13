---
status: completed
created: 2026-06-16
phase: 1/1
required_gates:
  test_verdict: false
  memory_update: true
---

# Plan: Trim AGENTS.md Template Repository Guidance (Issue #72)

**Date:** 2026-06-16
**Status:** Complete
**Issue:** [#72](https://github.com/Macacoders/ai-config/issues/72)
**Source:** `docs/ai/prompt-audit-2026-06-16.md` finding B

## Goal

Replace the 7 verbose sub-sections in the AGENTS.md template's Repository Guidance with 3 compact sub-sections (Project Overview, Build/Test Commands, Key Conventions & Constraints). Sync `research.md` to match. Move template from `templates/` to `base/` and remove the stale `templates/` directory.

## Phases

### Phase 1: Trim template and sync research agent — Complete

- **AGENTS.md template**: 131 → 91 lines. Repository Guidance now has 3 sub-sections with `[FILL IN]` placeholders.
- **base/opencode/agents/research.md**: AGENTS.md Guidance updated to list 3 sub-sections instead of 7.
- Removed: Code Style & Conventions, Testing Expectations, Security Notes, Deployment, PR/Commit Guidance from template.

### Phase 2: Move template to base/ and remove stale templates directory — Complete

- `templates/AGENTS.md` → `base/AGENTS.md` (git mv)
- Updated all path references in: `install/bootstrap.sh`, `install/bootstrap.ps1`, `install/lib/managed_sync.sh`, `research.md`, `onboard-repo.md`, `README.md`, `AGENTS.md`, `docs/ai/architecture.md`, `tests/bash/bootstrap_cli.bats`, logs, and plan file
- Removed stale `templates/opencode/` directory (`.gitkeep` files + obsolete README)
- `templates/` directory fully removed

## Files changed (combined)

| File | Change |
|---|---|
| `base/AGENTS.md` | Moved from templates/, trimmed to 91 lines, 3 sub-sections |
| `base/opencode/agents/research.md` | AGENTS.md Guidance synced to 3 sections |
| `base/opencode/commands/onboard-repo.md` | Path reference updated |
| `install/bootstrap.sh` | Source path updated (2 occurrences) |
| `install/bootstrap.ps1` | Source path updated (1 occurrence) |
| `install/lib/managed_sync.sh` | Source path updated (1 occurrence) |
| `tests/bash/bootstrap_cli.bats` | Comparison paths updated (3 lines) |
| `README.md` | Path references updated |
| `AGENTS.md` (root) | Path references updated |
| `docs/ai/architecture.md` | Path references updated |
| `docs/ai/logs/2026-06.md` | Entry added |
| `docs/ai/plans/2026-06-16-trim-agents-template-issue-72.md` | Plan file |
