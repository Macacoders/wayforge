---
status: completed
created: 2026-07-01
phase: 1/1
required_gates:
  test_verdict: false
  memory_update: true
---

# Plan: TypeScript Plugin Migration Analysis — Issue #85

**Date:** 2026-07-01
**Status:** ✅ Complete

## Goal

Analyze whether agent metadata, permissions, command definitions, tool definitions, and agent prompts can migrate from YAML+Markdown to TypeScript plugins. Produce a written recommendation (ADR) and follow-up implementation issues.

## Scope Classification

| Field | Value |
|-------|-------|
| **Size** | Multi-phase (analysis) |
| **Phase budget** | 2 |
| **Quick delivery eligible** | No |

## Phases

### Phase 1 — Source-Type Assessment & Plugin API Mapping ✅
Inspected all 6 agent files, 14 command files, permissions YAML, 3 existing plugins, installer managed_sync scripts, and opencode.jsonc generation templates.

**Deliverable:** `temp/issue-85-findings.md`

### Phase 2 — ADR & Follow-up Tasks ✅
- Created ADR-0018 at `docs/ai/decisions/ADR-0018-ts-plugin-migration-analysis.md`
- Created issue #154: Investigate plugin API for agent permission configuration
- Created issue #155: Auto-discover plugins in opencode.jsonc generation templates

## Key Outcomes

| Source Type | Verdict |
|------------|---------|
| Agent metadata | ❌ Stay in Markdown — no plugin hook |
| Agent permissions | ❌ Stay in YAML+frontmatter — TS installer handles rendering; plugin migration not worth pursuing (#154 closed) |
| Command definitions | ❌ Stay in Markdown (for now) |
| Tool definitions | ✅ Already migrated (plugin pattern proven) |
| Agent prompts | ❌ Stay in Markdown (plugins can augment only) |
| Plugin registration | ⚠️ Needs auto-discovery (#155) |

## Decisions Recorded

- ADR-0018: TS Plugin Migration Analysis (updated: permissions stay, ADR-0014 valid)
- Issue #131 noted as dependency for permissions migration sequencing (now complete)
- Issue #154 closed: plugin API permission spike not worth pursuing
