# ADR-0024: Add triage skill and /triage command for error/bug paste hygiene

**Date:** 2026-07-07
**Status:** accepted

## Context

Pasting raw errors, stack traces, and log dumps directly into the planner agent often poisoned the session context, replacing useful state with raw noise. This produced poor plans and wasted context budget (WF2 from `pablo-review-over-audit.md`). The old 171-line monolithic planner had no structured way to handle error pastes.

## Decision

Add a `triage` skill (not an agent) with:

1. **Error-hygiene summarization**: Before any investigation, summarize the pasted error into "Symptom / Suspected area / Unknowns" — a one-paragraph summary that prevents raw stack traces from poisoning the rest of the session.
2. **Four classification questions**: blocking?, plan vs quick?, regression test needed?, worth fixing now?
3. **Recommendation output** (`/quick`, `/plan`, or "not worth fixing now") — the skill does **not** invoke other agents; it only makes a recommendation.

Add a thin `/triage` routing command (≤8 lines) that loads the skill and routes to `planner`. Add an error-paste detection rule to `planner`'s core rules: "If input looks like a pasted error or log, summarize the symptom first and recommend `/triage`."

## Rationale

- **Skill, not agent.** Loading a full agent context just to ask 4 classification questions is over-engineering. A skill is loadable by the active gate without creating a new agent context.
- **Recommendation, not invocation.** The user keeps control of the gate transition; no two primary-agent contexts are ever loaded together.
- **Context hygiene first.** The error-hygiene step protects context budget before any analysis starts.

## Consequences

- Triage is a lightweight, loadable path for error handling.
- No new primary agent — gate count stays at 2 (planner, delivery).
- Users must prefix error pastes with `/triage` for the skill to load; automatic detection in planner provides a fallback.
- Future: the classification could evolve into structured issue creation, but that is out of scope for P2.
