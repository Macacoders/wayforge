# Make `/tasks close` Tolerate Missing Optional AI Memory Files (Issue #31)

Date: 2026-05-27  
Status: Completed  
Issue: [#31](https://github.com/Macacoders/ai-config/issues/31)

## Goal

Make the close/review workflow tolerate missing optional AI memory files (especially `docs/ai/architecture.md`) so consuming repositories without the full `docs/ai/` memory structure can complete close operations without errors.

## Changes Made

### Phase 1 (single phase — completed)

| File | Change |
|------|--------|
| `base/opencode/commands/close.md` | Replaced unconditional "Review... architecture notes" with conditional language: `docs/ai/architecture.md` is loaded only when the task involves architecture, data flow, module boundary, deployment, or public contract changes. Added explicit instruction that absent optional files are non-blocking. |
| `base/opencode/agents/planner.md` | Added safety note in Progressive Disclosure: "Before reading an optional memory file, check whether it exists. If the file is absent, skip it silently — do not fail, error, or produce noise." |

### Consistency Verification

Full grep across all `base/opencode/` files confirmed no remaining unconditional references to architecture notes, ADRs, logs, or other optional memory files.

### Validation

- Git status/diff review of all changes
- Full coverage grep verification
- No code or test changes needed (guidance-only change)

## Commit Message

```
fix(instructions): condition architecture notes on task scope

- close.md: load architecture.md only when task involves architecture,
  data flow, module boundary, deployment, or public contract changes
- planner.md: add safety note to check optional file existence before
  reading; skip silently if absent
```
