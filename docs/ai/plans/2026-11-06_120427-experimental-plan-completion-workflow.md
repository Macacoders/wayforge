---
status: completed
created: 2026-11-06
task: 3/3
required_gates:
  architect_review: true
  memory_update: true
---

# Experimental plan-completion workflow implementation plan

**Goal:** Add an opt-in implement-then-audit workflow in which a primary implementer completes an approved plan and a primary auditor independently triages the completed result once.

**Architecture:** Keep the installed `delivery` workflow unchanged and add three new agent identities: `implementer` and `auditor` are primary agents, while `scout` is a common read-only subagent. Agent files remain role and authority contracts only; the full-plan execution protocol and audit-triage protocol live in two agent-specific skills, and each scout invocation receives its specialization, scope, and expected evidence in a compact work order. Experimental plans use their own explicit execution state so an old `delivery` run cannot mistake implementer-completed work for independently accepted work.

**Tech Stack:** OpenCode Markdown agents and skills, centralized YAML permissions, provider-specific JSONC agent blocks, TypeScript/Vitest installer tests.

**Scope classification:** multi-task

**Plan acceptance criteria:**
- Existing `delivery`, `code`, `reviewer`, `architect`, and their commands retain their current behavior and permissions.
- Installed OpenCode configurations expose opt-in primary `implementer` and `auditor` agents plus a read-only `scout` subagent for every supported provider profile.
- `implementer` can complete a whole explicitly experimental plan: discover only missing context through scouts, validate every task, commit validated task work, record completion and evidence, and produce a compact final execution changelog.
- `auditor` can audit the completed commit range once, dispatch bounded specialized scout calls, and return a deduplicated high/medium/low table whose blocking threshold is evidence based.
- The central permission matrix and automated tests prove that only the two primary experimental agents can dispatch `scout`, that only `implementer` can write and commit, and that `auditor`/`scout` remain read-only.

### Task 1: Define concise experimental agent and skill contracts

**Status:** accepted
**Depends on:** none

**Objective:** Add the `implementer`, `auditor`, and `scout` source agents plus the focused skills that provide their progressive-disclosure operating detail. Define one unambiguous, opt-in plan-state and changelog convention for the experimental path.

**Context:**
- `base/opencode/agents/code.md` — current bounded implementation-worker contract; reuse its evidence, scope, validation, and durable-memory authorization boundaries without inheriting delivery-only constraints.
- `base/opencode/agents/reviewer.md` — current independent read-only review/evidence contract; reuse its proof-before-blocking discipline.
- `base/opencode/agents/planner.md` — primary-agent frontmatter and concise role-contract style.
- `base/opencode/agents/research.md` — model for a bounded, evidence-only investigation result.
- `base/opencode/skills/create-skill/SKILL.md` — required concise skill frontmatter and guidance shape.
- `base/opencode/skills/plan/SKILL.md` — current plan status vocabulary is owned by the delivery path; the experimental convention must not silently redefine it.

**Acceptance criteria:**
- `implementer.md` is a `mode: primary` agent that reads an explicitly experimental approved plan, completes all dependency-ready tasks, runs only agent-owned validations, commits each validated task, and emits one final changelog containing task/commit/evidence/decision/residual-risk records.
- The implementer contract permits a `scout` call only for a missing, bounded fact; it supplies the scout with an objective, lens, allowed paths/references, and expected evidence rather than its full conversation or a generic "explore" request.
- `auditor.md` is a `mode: primary`, read-only agent that audits the completed plan and named commit range once; it may fan out to `scout` with different lenses (acceptance/regression, codebase, docs, ADR/architecture, security, or simplicity) but must deduplicate their evidence before reporting.
- The auditor returns a finding table with ID, risk (`high`, `medium`, or `low`), evidence/impact, affected task or commit, and disposition. High means a demonstrated approved-criterion failure, applicable contract/ADR conflict, or material correctness/reliability/security regression and requests change; medium requests a bounded in-scope correction only when it is clearly justified, otherwise becomes follow-up; low never blocks and becomes follow-up.
- `scout.md` is a `mode: subagent` that is read-only, non-delegating, and caller-neutral. It acts only on the handed-off lens and scope, distinguishes verified facts from assumptions, and cannot label a concern blocking or propose implementation work.
- Add `implementation-quality` and `review-triage` skills. The former defines experimental-plan eligibility, task state/changelog records, validation/commit evidence, and bounded scouting; the latter defines audit inputs, scout work-order shape, evidence threshold, deduplication, and risk/disposition table. Neither skill repeats the other agent's standing rules or imports the legacy `delivery-policy` loop.
- The experimental skill defines an unmistakable plan marker and isolated per-task completion record (for example, an experimental workflow frontmatter marker plus `Experimental status: pending | in-progress | completed | blocked`). It leaves existing `Status: ...` and `delivery` semantics intact, and explicitly rejects plans missing that marker.

**Constraints:**
- Do not add slash commands, modify existing agent files, or change `delivery-policy`.
- Keep each agent file to identity, authority, forbidden actions, required inputs, and result shape; place procedural checklists in the new skills and per-run facts in work orders/changelogs.
- `implementer` does not independently accept its work; completion means locally validated and committed, not audit acceptance.
- Do not create distinct scout identities or specialization-specific skills in this first setup.

**Validations:**
- `agent`: `git diff --check -- base/opencode/agents base/opencode/skills` — expected: no whitespace errors.
- `agent`: `find base/opencode/agents -maxdepth 1 -type f -name '*.md' -print | sort` — expected: includes exactly the three new experimental agent source files alongside existing agents.

**Proposed commit message:** `feat: add experimental implementer audit agents`

### Task 2: Wire experimental identities, least-privilege dispatch, and provider models

**Status:** accepted
**Depends on:** Task 1

**Objective:** Make the experimental agents installable and usable under every supported provider profile, with central permissions that enforce the intended authority and delegation graph.

**Context:**
- `base/opencode/permissions/agents.yml` — source of rendered agent permissions; its coarse last-match-wins shell model and reviewer read-only deny list are the templates for `auditor` and `scout`.
- `cli/src/lib/permissions.ts` — automatically renders one permission block for every Markdown source agent; no renderer change is needed when every new agent has a YAML entry.
- `base/opencode/config/agents/*-agent-block.jsonc` — all seven provider profile fragments must define the same installed agent IDs.
- `cli/tests/unit/permissions.test.ts` — existing matrix assertions and rendering coverage.
- `cli/tests/unit/config-gen.test.ts` — fragment parsing and provider-profile model/step assertions.

**Acceptance criteria:**
- `implementer` has product-write authority and can commit, but cannot push or tag; it may dispatch only `scout`.
- `auditor` and `scout` have `edit: deny`, an explicit read-only shell deny list equivalent to `reviewer` for ordinary writes and Git mutations, cannot commit/push/tag, and cannot dispatch any agent except `auditor → scout`.
- `scout` cannot dispatch subagents; neither existing worker/reader roles gain a new delegation privilege.
- Every `base/opencode/config/agents/*-agent-block.jsonc` fragment defines `implementer`, `auditor`, and `scout`, with model/step allocations appropriate to their nearest existing role (`code`, `reviewer`, and `research` respectively) and without altering existing mappings.
- Permission tests assert the experimental delegation graph, implementer commit boundary, and read-only auditor/scout controls; the existing all-agent rendering loops continue to cover the expanded source directory.
- Configuration tests parse every provider fragment and assert all three experimental IDs are present; step-floor/model assertions are extended only where they protect the new role allocations.

**Constraints:**
- Do not modify the permission renderer or installer synchronization behavior unless a failing test proves the existing generic rendering cannot handle the added identities.
- Preserve all existing agent IDs, model choices, and permission behavior.
- Do not grant scouts access to caller conversations, write authority, or a broad catch-all delegation rule.

**Validations:**
- `agent`: `npx vitest run cli/tests/unit/permissions.test.ts cli/tests/unit/config-gen.test.ts` — expected: all permission rendering and provider-fragment tests pass.
- `agent`: `cd cli && npx tsc --noEmit` — expected: typecheck passes.

**Proposed commit message:** `feat: wire experimental workflow permissions`

### Task 3: Document the opt-in workflow and durable architecture decision

**Status:** accepted
**Depends on:** Task 2

**Objective:** Document the experimental workflow, coexistence boundary, and security/acceptance trade-off without presenting it as a replacement for the existing delivery pipeline.

**Context:**
- `docs/ai/architecture.md` — durable agent topology and workflow-boundary contract; it currently describes the delivery path as the only full-plan execution model.
- `docs/ai/decisions/ADR-0048-risk-proportionate-delivery-workflow.md` — current decision that assigns delivery-only commits/acceptance and per-task review; it must remain historical/current for the legacy workflow rather than be silently contradicted.
- `README.md` — user-facing workflow diagrams and role descriptions; it must describe the experimental route briefly without duplicating agent or skill procedure.
- `docs/ai/README.md` — memory ownership/router; update only if the new ADR needs a route beyond the existing decisions route.

**Acceptance criteria:**
- Add a new ADR that records the experiment: its goal, plan-completion audit model, explicit non-replacement of ADR-0048, distinct completion versus acceptance meanings, why generic caller-neutral scouts are used, and the decision criteria for retaining, revising, or removing the experiment.
- Update `docs/ai/architecture.md` with a concise experimental topology and authority boundary: implementer may commit completed tasks, auditor performs a single final independent audit, and only the experiment's documented final policy determines its outcome; the existing delivery workflow remains unchanged.
- Update `README.md` with a short opt-in workflow description that names the experimental agents and directs users to their installed agent/skill contracts, without adding commands or duplicating workflow checklists/diagrams unnecessarily.
- Documentation clearly states that this setup does not yet provide a deterministic orchestrator and that users must not use legacy delivery commands on an experimental-marked plan.
- The architecture/ADR language preserves independent review and evidence-backed high-risk blocking while making medium/low findings non-routine blockers.

**Constraints:**
- Do not rewrite historical plans or ADR-0048's original rationale; add a new decision rather than retroactively changing legacy authority.
- Keep README and architecture changes as routing/topology summaries; the agent files and skills remain the operational source of truth.
- Do not claim quantitative speed or quality improvement before the experiment has observed evidence.

**Validations:**
- `agent`: `git diff --check -- README.md docs/ai/architecture.md docs/ai/decisions base/opencode` — expected: no whitespace errors.
- `agent`: `rg -n "implementer|auditor|scout|experimental" README.md docs/ai/architecture.md docs/ai/decisions` — expected: terminology is consistent and identifies the workflow as opt-in.
- `human`: Install into a disposable repository with `wfg install --dry-run --repo <temporary-repo> --providers <supported-profile>` — expected: generated agent/config changes include all experimental identities and preserve existing managed output; run once per provider profile before release.

**Proposed commit message:** `docs: describe experimental completion audit workflow`

## Implementation amendments

- **Implementer-owned drift:** Added after approval to avoid planner round-trips when repository evidence changes an active experimental plan. The implementer records amendments and updates factual `docs/ai/**` memory; only unresolved public-contract, persistence, auth/security, deployment, or user-visible scope decisions pause for the user.
- **Audit evidence:** Auditor authority is scoped to experimental plans and durable logs, so it persists its final table without modifying product files, architecture notes, or ADRs.
