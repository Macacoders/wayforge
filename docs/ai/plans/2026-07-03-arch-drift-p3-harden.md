---
status: completed
created: 2026-07-03
phase: 1/1
required_gates:
  test_verdict: false
  architect_review: false
  memory_update: true
---

# Plan: Architectural Drift — P3 Harden

**Depends on:** P1 (gate split + invariants) being in place. P3 Phase 1 (YAML status format) can proceed immediately after P1 Phase 2. The architect subagent (P2) is not a prerequisite for plan persistence.
**Source:** `docs/ai/plans/pablo-review-over-audit.md` (WF1 caveats 3/6/7, considerations #1/#2/#5/#8/#9)

## Goal

Make the new architecture durable and self-improving: persist plans on disk with a stable status format including per-plan gated acceptance criteria so delivery only checks what the plan actually requires. Postpone roadmap/extensibility docs for later. Nothing here adds a primary agent or rubber-stamp ceremony.

## Confirmed Design Decisions

1. **Plan-on-disk format is YAML-frontmatter Markdown, not a database or plugin state.** Aligns with existing `docs/ai/plans/*.md` convention (every current plan already has a `**Status**` line; this just standardizes it). A future plugin *may* read this frontmatter — but P3 ships the format alone, no plugin yet (YAGNI).
2. **Definition of Done is plan-scoped, not universal.** The plan frontmatter carries optional `required_gates` — `test_verdict`, `architect_review`, `memory_update` — set per-plan. Delivery checks only the gates the plan actually requires. Not every phase needs QA theater or mandatory test verdicts; docs-only, config-only, and mechanical changes can set `test_verdict: false`.
3. **No new primary agents in P3** (gate count stays 2). No plan-review skill (ceremony) and no mandatory test verdict for every phase (checkbox factory) — both are replaced by the plan-scoped gate system.

## Scope Classification

| Field | Value |
|-------|-------|
| Size | Multi-phase |
| Phase budget | 4 |
| Phase budget rationale | Four separable deliverables: (1) plan status format, (2) quality rubric skill, (3) QA log-gate, (4) roadmap + extensibility docs. Each is independently reviewable. |
| Quick delivery eligible | No |
| Split required | No |

## Phases

### Phase 1: Plan-on-disk YAML status format

**Scope:**
- Define the canonical plan frontmatter (mirrors existing `**Status**`/`**Date**` lines, standardized as YAML):
  ```yaml
  ---
  status: planned | in-progress | completed | superseded
  created: YYYY-MM-DD
  phase: <n>/<total>        # current/"complete"
  ---
  ```
- Add a short `## Plan Status Convention` section to `planner.md`: planner writes the approved plan to `docs/ai/plans/<YYYY-MM-DD-slug>.md` with this frontmatter and updates `phase:` after each phase boundary.
- Add the mirror rule to `delivery.md`: on each phase completion/review, update the active plan's `phase:` and `status:` frontmatter in place (and route durable decisions to ADRs via the P2 `architect` flow).
- Backfill the frontmatter on the *new* plan files produced by P1/P2 of this effort (a one-time normalization — do not mass-rewrite existing historical plans, only the three arch-drift plans).
- Document in `memory-maintenance/SKILL.md` that `/memory check` treats plan frontmatter `status: in-progress` with no recent `phase:` bump as a stale signal.

**Acceptance criteria:**
- [ ] Plan Status Convention documented in `planner.md` and `delivery.md`
- [ ] `delivery.md` instructs updating plan frontmatter at phase boundaries
- [ ] The three arch-drift plan files carry the new frontmatter
- [ ] `memory-maintenance/SKILL.md` references plan-frontmatter staleness
- [ ] No plugin code is added
- [ ] `make check` passes

**Risks:**
- In-place frontmatter edits by delivery could conflict with concurrent manual edits. Low — single-active-plan assumption holds in this workflow.

### Phase 2: Plan-quality rubric skill (applied by delivery review)

**Scope:**
- Create `base/opencode/skills/plan-review/SKILL.md` — a checklist the `delivery` gate uses when reviewing a proposed or completed plan:
  - Each phase is a vertical slice (working behavior) unless a horizontal split is explicitly justified.
  - Every phase has observable acceptance criteria (not "implementation tasks").
  - Atomic stages live *inside* one phase, not split across phases.
  - Phase count respects P1 Phase Economy budget (1 / 2-3 / 6-8-confirmed / split >8).
  - Test strategy named per phase (or an explicit no-new-tests rationale per ADR-0006).
  - ADR-touching phases route through the P2 `architect`.
  - Repository-boundary and ponytail-ladder expectations referenced, not re-inlined.
- Wire `delivery.md` Phase Review to load the `plan-review` skill at review time; planner is *not* required to load it (planning is the gate, not review).

**Acceptance criteria:**
- [ ] `base/opencode/skills/plan-review/SKILL.md` exists with the checklist above
- [ ] `delivery.md` Phase Review references / loads the `plan-review` skill
- [ ] `planner.md` does not load it (gate separation preserved)
- [ ] `make check` passes

**Risks:**
- Low. The rubric is judgmental, not enforced — frame as a checklist delivery applies, not a hard gate.

### Phase 3: Lightweight QA log-gate

**Scope:**
- Change `delivery.md` Phase Review rule: a phase may not be marked approved until the `test` subagent has produced a recorded verdict on it — either `No new tests needed` + rationale, or named gaps + recommended tests. The verdict is mandatory *evidence*; it does not block merging trivial/docs-only changes (ADR-0006 stays intact — opt-in for *writing* tests, mandatory *verdict*).
- Update `base/opencode/agents/test.md` review output so `No new tests needed` requires a one-line rationale referencing the change class (docs-only / config-only / mechanical / already-covered).
- Update `staged-delivery/SKILL.md` Review section to name the QA log-gate as a required phase-completion signal.
- Do not change the "test writing is opt-in" policy; only the *verdict* becomes required.

**Acceptance criteria:**
- [ ] `delivery.md` requires a recorded test verdict before phase approval
- [ ] `test.md` makes `No new tests needed` require a one-line rationale
- [ ] `staged-delivery/SKILL.md` names the QA log-gate as a required signal
- [ ] No change makes *writing* tests mandatory (ADR-0006 preserved)
- [ ] `make check` passes

**Risks:**
- Friction risk: mandatory verdicts on tiny changes feel heavy. Mitigate by capping the "No new tests needed" rationale to one line and auto-suggesting it from the change class.

### Phase 4: Long-term/roadmap planning + extensibility docs

**Scope:**
- Add a `## Long-term Planning` section to `planner.md`: when a request spans >8 phases (the existing Scope Too Large trigger), planner produces a *roadmap* (ordered milestones, each itself a plan-sized task) instead of refusing; each milestone becomes its own plan file under `docs/ai/plans/` with `status: planned` (uses the P3 Phase-1 format). Distinguishes "single-plan work" from "roadmap of plans."
- Add `docs/extending.md` (consumed by downstream projects): the contract a consuming project follows to add its own specialized agents/skills — frontmatter rules, the shared-invariants reference pattern (P1), the command-as-routing-slip pattern (P1 Phase 3), the subagent-invocation permission model (P2). Keeps `base/AGENTS.md` template placeholders intact.
- Link `docs/extending.md` from root `README.md` and `base/AGENTS.md` project-overview section.

**Acceptance criteria:**
- [ ] `planner.md` has a Long-term Planning section mapping >8-phase work to a roadmap of milestone plans
- [ ] `docs/extending.md` exists and documents the four patterns (frontmatter, invariants reference, thin commands, subagent permissions)
- [ ] Root `README.md` and `base/AGENTS.md` link to `docs/extending.md`
- [ ] No new primary agent; no plugin code
- [ ] `make check` passes; no `base/AGENTS.md` template placeholders are filled in (preserved generic)

**Risks:**
- Scope creep into a full plugin for task tracking — out of scope. Keep the format-only approach; a plugin can be a later ponytail-debated enhancement.

## Validation Strategy

- `make check` after each phase.
- Smoke the plan-status format by re-reading the three arch-drift plans and confirming they carry the new frontmatter and that `delivery` could update `phase:` without ambiguity.
- Walk the QA log-gate against a sample docs-only change: confirm a one-line `No new tests needed (docs-only, no observable behavior change)` verdict satisfies the gate without writing tests (ADR-0006 preserved).
- Confirm gate count is unchanged across P2 and P3: `rg -n "mode: primary" base/opencode/agents` returns exactly `planner.md` and `delivery.md`.
- Confirm no plugin/runtime storage was introduced anywhere in P3: `rg -n "\.ponytail-active|sqlite|leveldb|\.config/opencode" docs/extending.md base/opencode` returns nothing new beyond existing references.

## Decisions To Record

- ADR: Standardize plan frontmatter (`status` / `created` / `phase`) as the durable, cross-gate plan-persistence format; agents update it at phase boundaries; no plugin state introduced yet. Motivation: WF1 caveat 3 — plan persistence is unstable; fixes the gap with the smallest possible mechanism (a few YAML fields) before considering a plugin.
- ADR: Make the `test` verdict a mandatory phase-completion *signal* (log-gate) while keeping test *writing* opt-in per ADR-0006. Motivation: WF1 caveat 7 + consideration 9 — QA never enters the loop, but forcing new tests would violate the existing opt-in policy; the verdict (not the tests) is the lightweight gate.
- ADR: Treat requests exceeding the 8-phase budget as a *roadmap of milestone plans*, not a refusal. Motivation: consideration 8 — long-term planning has no path today.
- ADR: Document the extensibility contract (`docs/extending.md`) so consuming projects can add specialized agents/skills without forking the workflow. Motivation: consideration 6.

## Out of Scope

- A ponytail-integration plugin that reads plan frontmatter and drives gate transitions (tracked as a future ponytail-debated enhancement; the format is shipped now so the plugin is YAGNI-safe).
- Cross-project agent/skill marketplace or registry — `docs/extending.md` documents the contract only.
- Mass backfill of historical plan files under `docs/ai/plans/` to the new frontmatter — only the three arch-drift plans are normalized in P3 Phase 1.