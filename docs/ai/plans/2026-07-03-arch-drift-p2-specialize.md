# Plan: Architectural Drift — P2 Specialize

**Date:** 2026-07-03
**Status:** planned (scratch). Relocate to `docs/ai/plans/` when plan mode is off.
**Depends on:** P1 Unbloat (planner/delivery split + shared invariants must be in place).
**Source:** `docs/ai/plans/pablo-review-over-audit.md` (WF2, considerations #1/#2/#6/#7)

## Goal

Cover the workflows P1 left unaddressed: a dedicated triage path for error/bug pastes (context hygiene), and an architectural-decision review specialist for tasks that touch ADR boundaries. Keep both lightweight and command-driven; do not overload either existing gate.

## Confirmed Design Decisions

1. **Triage is a skill + a thin command, not a new primary agent.** Loading a new agent's full context just to ask 4 classification questions is over-engineering. The triage skill is loadable by whatever gate is active (plan mode loads it via `/triage`); after classification it *recommends* `/plan` or `/quick` rather than invoking them, so the user keeps control of the gate transition and no two-agent context is ever loaded together.
2. **Architect is a subagent, not a primary.** Invoked by `planner` (when a planned phase touches architecture boundaries / ADRs / data-model) or by `delivery` (during phase review when a change crosses a recorded invariant). It proposes/reviews ADRs only; it does not author code or phases.
3. **No new primary agents in P2.** Primary gate count stays at 2 (`planner`, `delivery`).

## Scope Classification

| Field | Value |
|-------|-------|
| Size | Multi-phase |
| Phase budget | 2 |
| Phase budget rationale | Two independent specialists (triage; architect) — each is reviewable on its own with no cross-dependency. |
| Quick delivery eligible | No |
| Split required | No |

## Phases

### Phase 1: Triage skill + `/triage` command

**Scope:**
- Create `base/opencode/skills/triage/SKILL.md` with the classification question set (WF2-solutions 3a–3d): blocking? needs plan vs quick? needs a regression test after fix? plus an "error hygiene" step — summarize the pasted error into a one-paragraph "Symptom / Suspected area / Unknowns" before any investigation, so raw stack traces don't poison the rest of the session.
- The skill's output is a recommendation (`/quick`, `/plan`, or "not worth fixing now") — it does not itself invoke other agents.
- Create `base/opencode/commands/triage.md` — a thin routing slip that loads the `triage` skill and processes `$ARGUMENTS`. Route `agent: planner` (planner is the lighter gate; triage lands before a decision to plan, so it precedes the planning gate).
- Optional error-paste ergonomics: document a convention in `base/AGENTS.md` that pasting an error should be prefixed with `/triage` so the skill loads before investigation; the active agent summarizes + classifies, then recommends the next gate. Additionally, add automatic detection to planner's command text: "if input looks like a pasted error or log (stack trace, crash dump, exception), summarize the symptom first and recommend `/triage` before any investigation."

**Acceptance criteria:**
- [ ] `base/opencode/skills/triage/SKILL.md` exists with the 4 classification questions and the error-hygiene summarization step
- [ ] `base/opencode/commands/triage.md` exists as a ≤ 8-line routing slip routing to `planner`
- [ ] The skill explicitly states its output is a *recommendation*, not an agent invocation
- [ ] No new `mode: primary` agent file is created
- [ ] `make check` passes
- [ ] `ponytail-audit`-style grep: the triage question set is not duplicated into the command file

**Risks:**
- Low. If users ignore the `/triage` prefix and paste raw errors into `planner`, the context-poisoning problem persists. Mitigate via the AGENTS.md convention note, not enforcement code.

### Phase 2: Architect subagent + ADR-review handoff

**Scope:**
- Create `base/opencode/agents/architect.md` (`mode: subagent`) — reviews changes against existing ADRs in `docs/ai/decisions/`, flags conflicts, and proposes *new* ADRs when an architectural boundary/data-model/public-contract change is needed. Does not edit product code or author phases.
- Create `base/opencode/agents/planner/references/architect-handoff-template.md` — the brief planner/delivery send to `architect` (Phase/Task, Repository root, Changed files, ADRs in scope, Suspected boundary impact, Mode: `review-only` | `draft-adr`, Expected output).
- Add `architect` to `base/opencode/permissions/agents.yml` (edit: ask; bash: ask; task: deny — read-only analyst).
- Add an `"architect"` block to all 5 `base/opencode/config/agents/*agent-block.jsonc` fragments (match `research`'s model/steps; read-only analysis, not codegen).
- Allow `planner` and `delivery` to invoke `architect` — add `architect: allow` under their `task:` permission entries.
- Planner rule (P1 left this as deferred): when a planned phase touches any of the explicit architect-trigger categories (public contract, persistence format, auth/security boundary, deployment/runtime topology, data model, cross-module API), include an `Architect review:` note in the Plan Proposal and have `delivery` invoke `architect` during phase review.
- Delivery review rule: invoke `architect` in `review-only` mode before marking the phase approved when the phase touches any of these explicit categories (not a blanket "touches ADR" trigger, which is too broad):
  - Public contract change (API signatures, wire protocols, CLI interfaces, plugin boundaries)
  - Persistence format change (database schema, file formats, serialization contracts)
  - Auth/security boundary change (authentication, authorization, secret handling, trust domains)
  - Deployment/runtime topology change (container orchestration, networking, service discovery)
  - Data model change (domain entities, relationships, invariants)
  - Cross-module API change (internal module boundaries, shared libraries)

**Acceptance criteria:**
- [ ] `base/opencode/agents/architect.md` exists as a subagent and references the shared invariants file
- [ ] `base/opencode/agents/planner/references/architect-handoff-template.md` exists with the listed fields
- [ ] `architect` has a permissions entry and a config-fragment entry in all 5 provider fragments
- [ ] `planner` and `delivery` `task:` permissions allow `architect`
- [ ] `planner.md` notes the architect-invocation trigger on phases touching any of the 6 explicit categories
- [ ] `delivery.md` notes the architect-invocation trigger during review on phases touching any of the 6 explicit categories
- [ ] `make check` passes; fresh-install dry-run includes the `architect` agent block

**Risks:**
- Over-invocation: architect could trigger too often if categories are read broadly. Mitigate by scoping to the 6 explicit categories — only phases that actually change public contracts, persistence, auth/security, deployment topology, data models, or cross-module APIs trigger review.
- Config-fragment drift across 5 providers (same risk as P1 Phase 2). Edit all 5 together.

## Validation Strategy

- `make check` after each phase.
- `./install/bootstrap.sh --repo /tmp/opencode/p2-dry --providers free-tier --dry-run` — confirm `opencode.jsonc` gains the `architect` block (`triage` is a skill, so no agent block needed).
- Manual scenario walkthrough (no execution in plan): error-paste → `/triage` → recommendation → `/plan` for a known issue; confirm no two primary-agent contexts are loaded in one session.
- Grep: `rg -n "mode: primary" base/opencode/agents` returns only `planner.md` and `delivery.md` (P2 adds no primaries).

## Decisions To Record

- ADR: Add a `triage` skill (not an agent) and a `/triage` routing command to handle error/bug pastes with context hygiene; triage recommends the next gate but does not invoke agents. Motivation: WF2 — pasting raw errors into the bloated planner poisoned context and produced poor plans.
- ADR: Add an `architect` subagent for ADR/boundary review, invoked by planner (plan-time) and delivery (review-time) when a phase touches architectural invariants. Motivation: WF1 caveat 5 + consideration 7 — architectural decisions currently slip through with no specialized review; ADR-0003 covers research onboarding but not decision review.

## Out of Scope (deferred)

- Plan-on-disk YAML status format + plugin-assisted task tracking → P3.
- Plan quality rubric, lightweight QA gate, long-term/roadmap planning, extensibility docs → P3.