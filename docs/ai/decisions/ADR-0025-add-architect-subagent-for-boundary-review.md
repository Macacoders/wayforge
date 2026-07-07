# ADR-0025: Add architect subagent for architectural boundary review

**Date:** 2026-07-07
**Status:** accepted

## Context

Architectural decisions were slipping through without specialized review (WF1 caveat 5 and consideration #7 from `pablo-review-over-audit.md`). Existing ADRs documented decisions but no agent was responsible for enforcing or reviewing against them during implementation. The research onboarding agent (ADR-0003) covered initial repository discovery but not ongoing decision review.

## Decision

Add an `architect` subagent (read-only, `mode: subagent`) invoked by `planner` (plan-time) or `delivery` (review-time) when a phase touches any of 6 explicit boundary categories:

1. Public contract change
2. Persistence format change
3. Auth/security boundary change
4. Deployment/runtime topology change
5. Data model change
6. Cross-module API change

The architect:
- Reads relevant ADRs and the architecture document.
- Flags conflicts with prior decisions or invariants.
- Proposes new ADRs when a boundary change introduces a durable decision.
- Does **not** author code, create phases, or invoke other subagents.

The trigger is the **6 explicit categories**, not a blanket "diff touches ADR files" check (which is too broad).

## Rationale

- **Subagent, not primary.** Architect is a read-only specialist, not a new entry gate. Primary gate count stays at 2 (planner, delivery).
- **Explicit categories, not blanket trigger.** Scoping to 6 well-defined boundary categories prevents over-invocation and noise.
- **Review-only or draft-ADR modes.** Architect always works in one of two explicit modes, keeping its role bounded.

## Consequences

- Architectural drift risks are caught earlier — at plan-time or review-time, not after merge.
- Planner and delivery both have permission to invoke architect.
- Architect model config mirrors `research` in all 5 provider fragments.
- Future: architect could evolve to enforce architectural fitness functions or automated policy checks, but that is out of scope for P2.
