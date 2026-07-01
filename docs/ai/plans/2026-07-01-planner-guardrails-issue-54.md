# Plan: Audit Planner Guardrails Against Direct Code Implementation

**Issue**: #54
**Date**: 2026-07-01
**Status**: Complete — Phase 1 delivered

**Changes**:
- Added `## Code Implementation Boundary` section to `base/opencode/agents/planner.md` with hard-rule prohibition, allowed/prohibited edit lists, and fallback behavior
- Added documenting comment to `base/opencode/permissions/agents.yml`
- Created ADR-0020 documenting permission model decision

## Goal

Strengthen Planner's guardrails against direct code implementation in `base/opencode/agents/planner.md` — make the prohibition prominent, distinguish allowed vs prohibited edits, clarify fallback behavior when bypass is requested, and document permission limitations.

## Scope Classification

- **Size**: single-phase
- **Phase budget**: 1
- **Quick delivery eligible**: No

## Phases

### Phase 1: Strengthen Planner guardrails

**Scope**:
- Rewrite the guardrail in `base/opencode/agents/planner.md` from a single bullet point to a prominent dedicated section with clear allowed-vs-prohibited edit boundaries.
- Define fallback behavior: Planner proposes staged/quick delivery or asks for explicit confirm — never auto-bypasses.
- Add a comment to `base/opencode/permissions/agents.yml` documenting the `edit: ask` boundary.
- Verify `base/AGENTS.md` indirection is consistent.

**Acceptance criteria**:
- [x] Planner instructions prominently state that Planner must not directly implement code.
- [x] Allowed Planner edits (docs/ai memory, ADRs, plans, issue artifacts, AGENTS.md) are clearly distinguished from prohibited implementation code edits.
- [x] Fallback behavior is explicit: if user asks Planner to implement directly, Planner proposes staged/quick delivery or asks for redirect confirmation.
- [x] Permission limitations documented in agents.yml.
- [x] Changes made to source templates only (`base/opencode/`), not generated `.opencode/` output.

## Decisions To Record

- ADR: Planner permission model — `edit: ask` retained; path-based restrictions infeasible.
- Bypass guardrail is absolute — no automatic escape hatch.
