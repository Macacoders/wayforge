# Plan: Plugin Table Formatter Unification — Issue #149

**Date:** 2026-07-01
**Status:** ✅ Complete

## Goal

Unify two independent table-rendering implementations (`formatResults` in token-counter, `renderTable` in session-tracker) by extracting a shared utility module (Path B).

## Scope Classification

| Field | Value |
|-------|-------|
| **Size** | Single-phase |
| **Phase budget** | 1 |
| **Phase budget rationale** | Creating one shared module and updating two consumers is a single coherent deliverable. |
| **Path chosen** | B — Extract shared `renderTable` utility |

## Phase 1 — Shared `renderTable` utility ✅

| Stage | Change | Δ |
|-------|--------|---|
| S1 | Create `base/opencode/plugins/lib/render-table.js` with exported `renderTable(headers, rows)` | +22 lines (new file) |
| S2 | Update `session-tracker/index.js` — import from shared module, remove local function | +1 / −16 (−15 net) |
| S3 | Update `token-counter/index.js` — import and use `renderTable` in simplified `formatResults` | +1 / −23 +9 (−13 net) |

## Files Changed

| File | Δ |
|------|---|
| `base/opencode/plugins/lib/render-table.js` | +22 lines (new) |
| `base/opencode/plugins/session-tracker/index.js` | −15 lines net |
| `base/opencode/plugins/token-counter/index.js` | −13 lines net |

## Validation

- `node --check` passed on all 3 files (ESM syntax valid)
- `git diff` reviewed for correctness
- All 3 `session-tracker` call sites preserved and unchanged

## Decisions Recorded

- New shared module boundary: `base/opencode/plugins/lib/` for reusable plugin utilities
- `renderTable` signature: `(headers: string[], rows: Array<Array<string|number>>) => string`
