---
status: completed
created: 2026-07-03
phase: 4/4
required_gates:
  test_verdict: false
  architect_review: true
  memory_update: true
---

# Plan: Architectural Drift — P1 Unbloat

**Source:** `docs/ai/plans/pablo-review-over-audit.md` + `ponytail-audit-report.md`
**Related audit findings:** C1, C2, C3, H1, H2, H4, H3

## Goal

Slim the entry gates. Replace the single 171-line `planner` primary agent — which today loads planning, delivery pipeline, review, memory, issue, and audit context for *every* workflow — with two thin, independent primary agents (`planner`, `delivery`), each carrying only the context its workflow needs. Extract the invariants duplicated across 8 files into one shared reference so every agent loads them once instead of inlining them. Thin the 6 ponytail commands into routing slips. Add an explicit Discovery checkpoint before the Planning Output so "ask before you build" is enforced, not optional.

## Confirmed Design Decisions

1. **Separate primary agents, no parent/child nesting.** `planner` and `delivery` are independent entry gates. A conversation entered via `/plan` never loads `delivery`'s context, and vice-versa. Transitions are command-driven by the user, not agent-driven.
2. **Shared invariants live in one file.** `base/opencode/agents/references/invariants.md` (installed to `.opencode/agents/references/invariants.md`).
3. **Skills stop inlining invariants.** A skill is loaded *by* an agent; the loading agent already carries the invariants, so the skill references them by name, not by path (the installer only rewrites `base/opencode/` paths inside agent `.md` files, not skill files).
4. **Plans are already persisted on disk** under `docs/ai/plans/` per current planner duties. P1 only *enforces* that the planner reliably writes the approved plan there so `delivery` can read it; the structured YAML-status format is deferred to P3 (Harden).

## Scope Classification

| Field | Value |
|-------|-------|
| Size | Multi-phase |
| Phase budget | 4 |
| Phase budget rationale | Four clearly separable deliverables: (1) shared invariant file + de-inline, (2) agent split + command re-route, (3) thin ponytail commands, (4) Discovery checkpoint. Each is reviewable on its own; (2) depends on (1). |
| Quick delivery eligible | No |
| Split required | No |

## Command Routing After This Plan

| Command | Before | After |
|---------|--------|-------|
| `/plan` | planner | planner |
| `/onboard-repo` | planner | planner |
| `/implement-phase` | planner | delivery |
| `/review-phase` | planner | delivery |
| `/quick` | planner | delivery |
| `/close` | planner | delivery |
| `/issue` | planner | planner |
| `/memory` | planner | planner |
| `/ponytail` | planner | planner |
| `/ponytail-help` | planner | planner |
| `/ponytail-audit` | planner | planner |
| `/ponytail-debt` | planner | planner |
| `/ponytail-gain` | planner | planner |
| `/ponytail-review` | planner | delivery (diff review is a delivery/review concern) |

## Phases

### Phase 1: Shared invariants file + de-inline across agents

**Scope:**
- Create `base/opencode/agents/references/invariants.md` containing the canonical sections currently duplicated verbatim:
  - Repository Boundary (canonical version, currently in `planner.md`)
  - Progressive Disclosure — canonical (planner) *and* a "simplified subagent variant" (currently in code/quickcode/test/taskanalyst)
  - Ponytail 7-rung ladder (canonical, currently in `commands/ponytail-help.md`)
  - The "before creating new repeatable logic" sentence (currently verbatim in planner/code/quickcode)
- Replace the inline `## Repository Boundary`, `## Progressive Disclosure`, and ladder inline blocks in `agents/planner.md`, `agents/code.md`, `agents/quickcode.md`, `agents/research.md`, `agents/test.md`, `agents/taskanalyst.md` with a one-line reference: `## Shared Invariants — see \`base/opencode/agents/references/invariants.md\`` (path is installer-rewritten to `.opencode/agents/...`).
- Remove the duplicated "before creating new repeatable logic" sentence from planner/code/quickcode; keep it once in the invariants file.
- Remove the inlined 7-rung ladder from `planner.md:39`, `code.md:22`, `quickcode.md:20` — reference the canonical ladder in the invariants file instead.

**Acceptance criteria:**
- [ ] `base/opencode/agents/references/invariants.md` exists with Repository Boundary, Progressive Disclosure (both variants), and the 7-rung ladder
- [ ] No agent file inlines the full 7-rung ladder; all reference the invariants file
- [ ] No agent file duplicates the "before creating new repeatable logic" sentence
- [ ] The 6 agent files each contain exactly one `## Shared Invariants — see ...` reference line
- [ ] `make check-bash` passes (no shell touched, sanity only)
- [ ] Dry-run install rewrites the invariants path correctly in agent files: `./install/bootstrap.sh --repo /tmp/opencode/p1-dry --providers free-tier --dry-run`

**Risks:**
- Skill files still inline summarized boundary/disclosure sections — this phase leaves skills untouched (dealt with in Phase 2's skill trim). Low risk.
- Path-rewrite only applies to agent `.md` files; the invariants file itself sits under `agents/` so it's synced. Confirmed against `install/bootstrap.sh:573,611`.

### Phase 2: Split planner → thin planner + new delivery primary agent

**Scope:**
- Create `base/opencode/agents/delivery.md` (primary agent) owning the implementation pipeline only: phase handoff to `code`/`quickcode` (reading the persisted plan from disk and preparing implementation handoff briefs from it), git-based phase review, quick delivery review, close workflow, and the relevant handoff template references (code/quickcode/test). Does **not** own memory, shared task (issue) workflow, or task analysis — those are support workflows that stay with planner.
- Trim `base/opencode/agents/planner.md` to planning + support workflows: mission, core planning rules, repository boundary (ref to invariants), progressive disclosure (ref), planning output template, discovery questionnaire, phase economy (ref staged-delivery skill), quick delivery classification (ref quick-delivery skill), repository onboarding delegation to `research`, memory duties + freshness check, shared task (issue) workflow + taskanalyst handoff + task analysis brief authoring. Planner writes the approved plan to disk; delivery reads it and prepares implementation handoff briefs from it.
- Re-route commands to their new owning agent per the Command Routing table (edit `agent: planner` → `agent: delivery` in pipeline commands: `/implement-phase`, `/review-phase`, `/quick`, `/close`; keep `/plan`, `/onboard-repo`, `/issue`, `/memory`, and ponytail-lite commands on planner).
- Add `delivery` to `base/opencode/permissions/agents.yml` mirroring planner's permissions (edit: ask; git status/diff/log/show/branch/rev-parse/ls-files allow; gh-issue scripts allow; task: research/code/quickcode/test/taskanalyst allow).
- Add a `"delivery"` block to all 5 agent-block JSONC fragments in `base/opencode/config/agents/` (model `opencode-go/deepseek-v4-pro`, `steps: 24` for the opencode-go fragment; reasonable equivalents in the other provider fragments — match `planner`'s model/steps where the provider has an equivalent, else mirror `planner`).
- Remove from `planner.md`: Phase Review, Quick Delivery Review (implementation pipeline concerns only). Keep: Memory Duties, Memory Freshness Check, Shared Task Workflow, Task Analysis Brief authoring (support workflows that stay on planner).
- Update skills `staged-delivery/SKILL.md` and `quick-delivery/SKILL.md`: drop their inline Repository Boundary sections (the loading agent carries the invariants); keep workflow-specific guidance.
- Enforce plan-on-disk: planner's Planning Output section notes "write the approved plan to `docs/ai/plans/<YYYY-MM-DD-slug>.md`"; `delivery` Phase Review loads the active plan from that path.
- Update `base/AGENTS.md` and root `AGENTS.md` "Workflow & Engineering Rules": planner is no longer the single entry gate; name `planner` (planning) and `delivery` (implementation pipeline) as the two primary gates.

**Acceptance criteria:**
- [ ] `base/opencode/agents/delivery.md` exists as a primary agent (`mode: primary`)
- [ ] `planner.md` contains no Phase Review / Quick Delivery Review sections (implementation pipeline concerns moved to delivery)
- [ ] `delivery.md` contains no planning-output / discovery / phase-economy / memory / shared-task content (support workflows stay on planner)
- [ ] No duplicated policy between planner and delivery — each loads only its workflow's context
- [ ] 6 pipeline commands route to `delivery`; `/plan`, `/onboard-repo` route to `planner`
- [ ] `delivery` has a permissions entry and a config-fragment entry in all 5 provider fragments
- [ ] `staged-delivery` and `quick-delivery` skills no longer inline Repository Boundary
- [ ] `planner` reliably writes approved plans to `docs/ai/plans/` per its rules
- [ ] `make check` passes
- [ ] Fresh-install dry-run produces an `opencode.jsonc` with a `delivery` agent block: `./install/bootstrap.sh --repo /tmp/opencode/p1-dry --providers free-tier --dry-run`

**Risks:**
- **Behavior regression:** splitting review/memory off planner changes where those workflows enter. Mitigate by updating command routing carefully and documenting the new routing in `base/AGENTS.md`.
- **Provider fragment drift:** all 5 fragments must get the `delivery` block or non-opencode-go providers break. Mitigate by editing all 5 in one stage and dry-running each provider.

### Phase 3: Thin the ponytail commands into routing slips

**Scope:**
- Reduce `commands/ponytail-audit.md`, `ponytail-debt.md`, `ponytail-gain.md`, `ponytail-review.md`, `ponytail-help.md`, `ponytail.md` to 3–6 line routing slips: "Load skill `<name>`. Process: $ARGUMENTS" plus the one-line purpose. Move any procedural content that isn't already in the skill into the corresponding `skills/ponytail-*/SKILL.md`.
- Re-route `/ponytail-review` to `delivery` (diff review is a delivery concern); leave `/ponytail`, `/ponytail-help`, `/ponytail-audit`, `/ponytail-debt`, `/ponytail-gain` routed to `planner`.
- Ensure no procedural bullet list is duplicated between command and skill — single-source in the skill.

**Acceptance criteria:**
- [ ] All 6 ponytail command files are ≤ 6 lines of body text
- [ ] No scan criteria / ledger fields / impact metrics appear in both a command file and its skill
- [ ] `/ponytail-review` routes to `delivery`; the other 5 ponytail commands route to `planner`
- [ ] `make check` passes

**Risks:**
- Low — content moves to skills that already exist.

### Phase 4: Explicit Discovery → Plan Proposal checkpoint

**Scope:**
- Refactor the Planning Output in `planner.md` into two clearly separated blocks with a mandatory gate between them:
  - `## Discovery` — repository state, clarifying questions, assumptions, open unknowns. Output: a *confirmed* understanding the user must approve before planning.
  - `## Plan Proposal` — scope classification, phases with acceptance criteria, validation strategy, decisions to record. Produced only after Discovery is confirmed.
- Add a one-line "leading marker" rule: planner must present `## Discovery` first and *wait for user confirmation* before producing `## Plan Proposal`. Enforce by phrasing the planner rule as a hard checkpoint, not a suggestion.
- Update `commands/plan.md` wording to match: "Present Discovery, wait for confirmation, then propose a phased plan."
- Add "vertical-slice preference" guidance to the Phase Economy section in `staged-delivery/SKILL.md`: prefer phases that deliver a working slice end-to-end over horizontal layers; justify horizontal splits explicitly.

**Acceptance criteria:**
- [ ] `planner.md` Planning Output has distinct `## Discovery` and `## Plan Proposal` sections
- [ ] A planner rule states the Discovery checkpoint must be confirmed before the Plan Proposal is produced
- [ ] `commands/plan.md` describes the Discovery → confirmation → Plan Proposal order
- [ ] `staged-delivery/SKILL.md` Phase Economy notes a vertical-slice preference with explicit-justification escape hatch
- [ ] `make check` passes

**Risks:**
- Models may still collapse the two blocks into one. Mitigate with an explicit numbered step rule and a leading-word marker (`## Discovery (must confirm before planning)`).

## Validation Strategy

- `make check` after each phase (Bash/PS lint, tests, duplication threshold).
- `make check-duplication` — confirm the jscpd 8% threshold still passes (or improves) after de-inlining.
- Installer dry-run with each provider variant to confirm `opencode.jsonc` gains the `delivery` block and command routing is intact:
  `./install/bootstrap.sh --repo /tmp/opencode/p1-dry --providers free-tier --dry-run`
  `./install/bootstrap.sh --repo /tmp/opencode/p1-dry --providers opencode-go --dry-run`
- Command routing audit: confirm the 10 commands in the routing table map to the correct agent (4 pipeline commands → delivery, 6 planning/support commands → planner).
- Grep audit: `rg -n "use the stdlib|native platform features" base/opencode/agents` returns the ladder only inside `invariants.md`.

## Decisions To Record

- ADR: Split the single primary `planner` into two independent primary entry gates — `planner` (discovery + phased plan creation + support workflows: memory, shared tasks, issue management) and `delivery` (implementation pipeline only: phase handoff, review, quick delivery review, close). Motivation: planner.md was 171 lines and loaded planning + delivery + review + memory + issue + audit context for every workflow; each gate now carries only its workflow's context. Delivery reads persisted plans from disk and prepares implementation handoff briefs; it does not own memory maintenance or the shared task workflow. (Supersedes the "planner is the single source of truth" wording in ADR-0001 / root `AGENTS.md`.)
- ADR (extend ADR-0012): Centralize the Repository Boundary, Progressive Disclosure, and Ponytail ladder into `base/opencode/agents/references/invariants.md`; agents reference it by path; skills reference it by name and stop inlining.
- ADR: Thin ponytail commands to routing slips; the skill is the single source of ponytail procedural content.
- ADR (extend ADR-0002): Enforce an explicit Discovery checkpoint before the Plan Proposal in the planning workflow.

## Out of Scope (deferred)

- New specialized agents (triage, architect) → P2 Specialize.
- Structured YAML plan-status format + plugin-assisted task tracking → P3 Harden.
- Plan quality rubric, lightweight QA gate, extensibility docs → P3 Harden.
- Installer path-rewrite extension to skill files (skills reference invariants by name only).