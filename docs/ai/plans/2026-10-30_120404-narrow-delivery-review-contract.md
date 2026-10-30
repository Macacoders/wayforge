---
status: planned
created: 2026-10-30
task: 0/1
required_gates:
  architect_review: true
  memory_update: true
---

# Narrow the delivery review contract — implementation plan

**Goal:** Make acceptance-criteria review decisive and proportionate, with one clear, finite rule for genuine blockers and shorter, consistent delivery instructions.

**Architecture:** Keep the existing `reviewer` verdict and independent review; do not introduce an approver. Own the blocking threshold, retry/stop rule, and acceptance gates in the source `delivery-policy` skill; leave agents and commands with only their role-specific contracts and references to that policy. Reconcile ADR-0048's conflicting descriptions in an explicit amendment. Source templates under `base/opencode/**` are authoritative, not the generated `.opencode/**` installation.

**Tech Stack:** OpenCode Markdown agent, command and skill templates; `docs/ai/` ADR memory; existing repository checks.

**Scope classification:** `single-task`. **Risk:** `full` — changes the shared review/acceptance contract and cross-agent workflow boundary. One task avoids committing an interim state where the policy and the commands disagree.

**Plan acceptance criteria:**

- The reviewer can pass a task when required criteria, established applicable contracts and required validation evidence pass, without a speculative edge case or optional improvement becoming a repair request; an independently evidenced material in-scope defect remains blocking. Evidence: compare the same decision rule across policy, reviewer, commands, and scenario walkthroughs below.
- The whole direct and plan delivery paths use the same work-order names, verdict meanings, finite repair budget, revision-sensitive review and escalation rule. Evidence: inspect the source templates and walk direct, repair, resumption, and declared-gate scenarios.
- ADR-0048 explicitly reconciles its progress-only versus numeric retry passages and its blanket outside-criteria follow-up language versus demonstrable in-scope defects. Evidence: inspect the amendment alongside the operative policy; plan-time architect review passed for this proposed boundary, implementation still requires the declared architecture gate.
- No new agent, state store, universal review gate, changed authorization, or generated-file edit; existing independent review, commit authority, human-owned validation boundary, cross-component checks, and declared phase gates remain intact. Evidence: scoped diff and repository checks.

### Task 1: One concise, consistent review-and-delivery contract

**Status:** pending
**Depends on:** none

**Objective:** Deliver a single, unambiguous acceptance threshold and bounded review loop across the source policy, reviewer and orchestrator instructions, and ADR-0048. Remove duplicated procedural prose without removing safety boundaries.

**Context:**

- `base/opencode/skills/delivery-policy/SKILL.md` owns risk classification, work orders, verdict interpretation, gates, 1 implementation + 2 repairs, escalation and resumption. Its existing finding classification permits demonstrable defects beyond numbered criteria; that exception currently lacks a clear materiality threshold.
- `base/opencode/agents/reviewer.md` supplies revision-specific evidence and `pass | changes_required | blocked`; `agents/delivery.md` orchestrates but cannot self-verify or overrule substantiated findings; `agents/architect.md` limits review to declared architectural boundaries. The reviewer must retain authority to report a genuine in-scope defect, not become report-only.
- `base/opencode/commands/deliver-plan.md`, `review-task.md`, `implement-task.md`, and `deliver.md` are the autonomous, manual and direct entry points. `deliver.md` currently calls for a `verification` work order and a criterion-fails-twice stop, while the source policy calls it `functional_review` and caps repairs at two; both routes need the same contract. Keep manual and direct paths consistent without expanding their scope.
- `base/opencode/skills/plan/SKILL.md` tells planners how to write evidenced task criteria and name shared contracts. Touch only if required to remove an actual contradiction; retain risk-selected compatibility evidence from #265 and exhaustion diagnosis/authorization from #264. The completed `docs/ai/plans/2026-10-29_123852-stabilize-deliver-plan-review-and-repair.md` is historical and must not be rewritten.
- `docs/ai/decisions/ADR-0048-risk-proportionate-delivery-workflow.md` lines 56–60, 134–140 and 295–306 contradict one another about progress-only versus numeric stopping and all outside-criteria findings versus material defects. Plan-time architect review of the proposed resolution passed at HEAD `d4b90ca`, conditional on an explicit ADR amendment and aligned commands; no new ADR is needed.
- The local `.opencode/` generated policy and agents are older than the source templates. Do not edit them; a future consuming-repository rollout must reinstall the approved templates and restart OpenCode, but is not a gate for this source-template plan. Preserve the pre-existing unrelated `package-lock.json` change.

**Acceptance criteria:**

- A `functional_review` returns per-criterion `pass | fail | unverifiable`, a reviewed revision, and `pass | changes_required | blocked`. A blocking finding identifies a failed approved criterion, a violated established applicable contract, **or** a demonstrated material correctness/reliability/security defect within the affected boundary, with concrete impact and evidence. `unverifiable` or an unresolved consequential decision cannot be relabeled a repair. Evidence: source work-order, reviewer and verdict descriptions plus scenario walkthroughs.
- Preferences, speculative edge cases without demonstrated material impact, unrelated/pre-existing observations and ADR proposals without a demonstrated conflict remain non-blocking follow-ups (at most a bounded report), never additional acceptance criteria. The absence of an enumerated criterion alone does not suppress a demonstrated material defect. Evidence: reviewer/architect guidance, policy decision table, and walkthroughs contrasting those cases.
- Both `/deliver` and `/deliver-plan` (and the manual `/review-task` path) use the same policy-owned `functional_review` and `repair` vocabulary. One initial implementation and at most two repairs per task remain the default hard cap across resumed runs; stop earlier if a repair round makes no material change to failing evidence, and escalate with attempts and decision required. A newly evidenced material defect does not reset the cap; extra attempts remain explicit, finite and user-authorized. Evidence: source command and policy inspection plus a repeated-failure/new-defect scenario.
- Required validations and current-revision independent verdicts still gate commit; relevant shared-contract mismatches identify both sides of an applicable contract; declared architect and phase integration gates stay conditional and valid on unchanged revisions. Missing future counterparts are integration risks, not automatic failures. Evidence: direct/plan/paused-run and compatible/incompatible counterpart scenario walkthroughs against source instructions.
- `delivery-policy` is the sole owner of common decision rules. `delivery.md`, `reviewer.md`, `architect.md` where needed, and the commands state only bounded role/output or entry-point guidance; remove conflicting and redundant procedural explanations without sacrificing self-contained worker work orders. ADR-0048 explicitly supersedes incompatible earlier text, including its earlier blanket follow-up and progress-only claims. Evidence: scoped diff and ADR comparison.

**Constraints:** Keep `code` as the only implementer and `delivery` as sole committer; independent read-only reviewers, required gate/validation ownership, permission boundaries, approved scope and revision freshness remain. Do not add an approver, rewrite accepted historical plans, remove genuine defect blocking, silently extend budgets or waive a declared gate. Prefer consolidating and deleting duplicated prose to introducing new structures. Edit only source templates and the relevant ADR; do not modify generated `.opencode/` or unrelated `package-lock.json`.

**Validations:**

- `agent`: `make check` — expected: existing repository checks pass; distinguish pre-existing/unrelated failures.
- `agent`: read-only scenario walkthrough of policy and source commands for (1) all ACs pass plus speculative edge case, (2) ACs pass plus demonstrated material in-scope defect, (3) applicable shared-contract mismatch and unavailable future counterpart, (4) failed repair with unchanged evidence and newly evidenced defect at the hard cap, (5) paused run retaining used counts and revision, (6) declared architect/phase gate versus unneeded gates, and (7) direct vs plan route — expected: each has the same finite disposition and authority in all entry points.

**Proposed commit message:** `refactor: narrow and unify delivery review contract`
