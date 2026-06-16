# Plan: Move planner handoff templates to reference files

- **Issue**: [#71](https://github.com/Macacoders/ai-config/issues/71)
- **Source**: Finding A from `docs/ai/prompt-audit-2026-06-16.md`
- **Status**: ✅ Complete (2026-06-16)

## Goal

Reduce `base/opencode/agents/planner.md` from 325 lines (~4,600 tokens) to under 230 lines (~2,500 tokens) by extracting 5 handoff-brief template blocks into standalone reference files under `base/opencode/agents/planner/references/`.

## Phases

### Phase 1: Extract templates and replace with pointers ✅

**Scope**: Create `base/opencode/agents/planner/references/` with 5 reference files. Replace inline template blocks with compact one-liner pointers. Verify under 230 lines.

**Result**: 228 lines. All 5 templates extracted. Shared Task Workflow unchanged.

**Changed files**:
- `base/opencode/agents/planner.md` (modified)
- `base/opencode/agents/planner/references/research-handoff-template.md` (new)
- `base/opencode/agents/planner/references/code-handoff-template.md` (new)
- `base/opencode/agents/planner/references/quickcode-handoff-template.md` (new)
- `base/opencode/agents/planner/references/test-handoff-template.md` (new)
- `base/opencode/agents/planner/references/task-analysis-template.md` (new)

### Phase 2: Fix installer propagation ✅

**Scope**: Fix two installer gaps discovered during review — (a) manifest-aware refresh used a non-recursive glob for agent files, missing subdirectory references; (b) installed agent files contained `base/opencode/` paths that don't exist in consuming repos.

**Result**: Both `bootstrap.sh` and `bootstrap.ps1` now recursively discover agent files (matching existing skills/plugins patterns) and rewrite `base/opencode/` → `.opencode/` in agent file content after both full install and manifest-aware refresh.

**Changed files**:
- `install/bootstrap.sh` (modified)
- `install/bootstrap.ps1` (modified)
