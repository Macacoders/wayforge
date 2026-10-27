---
status: completed
created: 2026-10-27
task: 2/2
required_gates:
  architect_review: true
  memory_update: true
---

# Narrow delivery-policy access implementation plan

**Goal:** Keep the full delivery policy owned by `delivery`, allow `planner` to consult it for planning/direct-path routing, and make troubleshooting and dispatched worker roles self-sufficient without loading the policy.

**Architecture:** Preserve `base/opencode/skills/delivery-policy/SKILL.md` as the sole authority for risk classification, work-order/result contracts, acceptance gates, and retries; `delivery` sends only relevant contract fields in each work order. `planner` may consult the policy for routing and must send a self-sufficient research or architecture work order when it dispatches one. `troubleshooter` makes a non-authoritative evidence-backed routing recommendation, leaving final classification to `delivery`. Amend ADR-0048's wording to record the distinction between owning a contract and requiring every recipient to load it.

**Tech Stack:** OpenCode agent/command/skill Markdown templates, `docs/ai/` ADRs, repository search and diff checks.

**Scope classification:** `multi-task` (two independently reviewable prompt boundaries: worker handoffs and diagnostic routing).

**Plan acceptance criteria:**
- `delivery` loads the full policy; `planner` may load it for classification; neither `troubleshooter` nor `code`, `reviewer`, `architect`, or `research` is directed or required to load it, including through indirect skill references.
- Work orders contain enough relevant expected output, constraints, acceptance/review target, and validation ownership for workers to act without consulting the policy. The shared result/verdict vocabulary remains consistent with the authoritative policy.
- Troubleshooting and triage remain recommendations only; `/deliver` independently classifies risk and routes `full` cases away from direct implementation. No review, authority, safety, or retry gate is weakened.
- ADR-0048 records the narrower loading boundary without erasing its original decision history. Changes are limited to source templates and the directly relevant ADR, not generated `.opencode/**` artifacts.

## Grounding and boundary

- `base/opencode/agents/delivery.md:15-17` already mandates loading the skill. `base/opencode/commands/{deliver,deliver-plan,implement-task,review-task}.md` are assigned to `delivery`; `/load-plan` uses the policy's legacy readiness rules. Keep these entry points intact.
- `base/opencode/agents/planner.md:31,60` and `base/opencode/commands/plan.md:8` consult the policy for routing/work-order construction. Keep planner's permission to consult it; avoid adding a requirement for the worker to load it.
- `base/opencode/agents/{code,reviewer,architect,research}.md` refer to the shared contract in `delivery-policy` for result shape, even though the work-order policy (`skills/delivery-policy/SKILL.md:63-75`) says each dispatched message includes an expected result. Make that handoff explicit, not a second policy definition embedded in each worker.
- `base/opencode/agents/troubleshooter.md:43-50` currently tells troubleshooters to read classification rules and effectively labels a confirmed local fix `direct`; `base/opencode/skills/triage/SKILL.md:36-41` points at the policy as well. Neither performs an authoritative delivery classification.
- ADR-0048 decisions 1, 2, 7, 8 and its Deliberate Duplication section intentionally centralize policy and reference it from worker files. An architect review of this intent found that the smallest durable change is an amendment to ADR-0048, not a new ADR: retain one owning policy and self-sufficient handoffs.
- The plugin token audit counted 1,970 tokens in `delivery-policy/SKILL.md` on this branch. Directory size is not per-session consumption; this plan narrows who needs to load the policy, **not** a target to delete its safety rules or claim measured runtime-token savings.
- The checkout currently has a user-created `package-lock.json` change from installing the token counter dependency. Preserve it and exclude it from work orders/commits for this plan.

## Tasks

### Task 1: Make dispatched worker contracts self-sufficient

**Status:** in-progress
**Depends on:** none

**Objective:** Remove the need for `code`, `reviewer`, `architect`, and `research` to read `delivery-policy` by making the dispatched work order the source of their expected result and relevant constraints, without duplicating the entire policy in their agent prompts.

**Context:**
- Modify: `base/opencode/agents/{code,reviewer,architect,research}.md` — replace references that require the worker to obtain its result format/contract from the policy with concise instructions to follow the expected result in the work order; preserve their existing role-specific safety and verdict requirements.
- Modify only if needed: `base/opencode/skills/delivery-policy/SKILL.md` (description or work-order/result section), `base/opencode/agents/planner.md` (research dispatch wording) — explicitly require `delivery` and any planner dispatcher to send a complete, bounded expected result. Do not copy the policy into the agent files.
- Reuse: existing `delivery-policy` Work Orders/Result Format sections and `reviewer.md`'s already self-contained verdict/revision/AC fields; leave `/deliver`, `/deliver-plan`, `/implement-task`, `/review-task`, and `/load-plan` as delivery-owned entry points.

**Acceptance criteria:**
- Each worker can satisfy a sample dispatched work order using its own role file and the order alone, with no instruction to load `delivery-policy`; reviewers still return revision-specific pass/changes_required/blocked verdicts with evidence, architects return evidence-backed boundary verdicts (revision-specific when reviewing a change), and research remains facts-only.
- The dispatcher still specifies objective, scope, acceptance criteria, relevant constraints, validation ownership, review target (for review orders), and expected result; workers retain their write/read boundaries and do not gain commit authority.
- The format has one authoritative owner in `delivery-policy`; no full duplicate schema or new utility/skill is introduced.

**Constraints:** Source templates only; do not modify generated `.opencode/**`. Do not change risk tiers, review gates, escalation budget, ADR-0048's original history, or repository boundary. Keep `planner` able to consult the policy.

**Validations:**
- `agent`: `rg -n 'delivery-policy' base/opencode/agents base/opencode/commands base/opencode/skills` — expected: `delivery`, `planner`, delivery commands, and legitimate owner references remain; worker prompts have no dependency on loading the skill. A `triage`/`troubleshooter` hit remains until Task 2.
- `agent`: `git diff --check -- base/opencode` and targeted `git diff -- base/opencode/agents base/opencode/skills/delivery-policy/SKILL.md` — expected: clean whitespace and only bounded wording changes; verify shared verdict/status fields are not dropped.
- `human`: none required; interactive model behavior is not an automated acceptance gate for this prompt-only change.

**Proposed commit message:** `refactor: make worker handoffs self-contained`

### Task 2: Decouple diagnosis from delivery classification and reconcile the ADR

**Status:** accepted
**Depends on:** Task 1

**Objective:** Remove `troubleshooter`'s policy-loading dependency and record the agreed loading boundary in ADR-0048 while keeping routing conservative and delivery classification authoritative.

**Context:**
- Modify: `base/opencode/agents/troubleshooter.md` — hand off symptom, confirmed root cause, evidence, expected behavior, candidate files, and validation to `/deliver` without declaring a final `direct` risk decision; route known boundaries or unresolved decisions toward `/plan`. Delivery still performs its own classification.
- Modify: `base/opencode/skills/triage/SKILL.md` — make `/deliver` vs `/plan` a short recommendation, without telling the triager to read the policy or importing its full boundary list; unknown/ambiguous risk should not be asserted safe for direct implementation.
- Modify: `docs/ai/decisions/ADR-0048-risk-proportionate-delivery-workflow.md` — add a dated amendment clarifying that the policy remains the single owner, `delivery` loads it, `planner` may consult it for classification, other roles receive relevant work-order information or concise diagnostic routing guidance rather than loading the policy. Update the earlier "referenced everywhere" and deliberate-duplication language without silently rewriting the original rationale.
- Reuse: `base/opencode/commands/deliver.md:6-12` already performs authoritative classification and routes `full` cases to `/intent` or `/plan`; no new classifier is needed.

**Acceptance criteria:**
- `troubleshooter` and `triage` can route a confirmed local fault toward `/deliver`, an architectural/auth/public-contract or otherwise uncertain fix toward `/plan`, without loading or citing `delivery-policy` as required reading. `/deliver` retains final risk classification and still refuses unsafe `direct` work.
- ADR-0048 accurately distinguishes policy ownership/loading from receiving a work order, preserves its single-owner/shared-protocol and independent-review decisions, and notes this amendment rather than claiming the old decision never existed.
- No changes to permissions, installer behavior, generated output, or delivery acceptance gates.

**Constraints:** Keep diagnostics non-mutating and handoffs advisory; do not grant `troubleshooter` authority to implement, review, or commit. Preserve the original ADR decision trail. If other references to `delivery-policy` are discovered, distinguish legitimate `delivery`/`planner` consumption from worker/diagnostic dependencies before editing.

**Validations:**
- `agent`: `rg -n 'delivery-policy' base/opencode/agents base/opencode/commands base/opencode/skills` — expected: no worker or diagnostic prompt needs to load it; `delivery`, `planner`, and delivery-owned commands remain authorized. `plan`'s execution-time legacy-plan reference is legitimate.
- `agent`: `git diff --check -- base/opencode docs/ai/decisions/ADR-0048-risk-proportionate-delivery-workflow.md` and `git diff --stat -- base/opencode docs/ai/decisions/ADR-0048-risk-proportionate-delivery-workflow.md` — expected: clean, bounded changes; unrelated `package-lock.json` change excluded.
- `agent`: review the three textual scenarios against final prompts: confirmed localized fix -> advisory `/deliver` -> delivery classification; known boundary/unknown risk -> `/plan`; worker result from dispatched order -> independent evidence-based review. Expected: all remain possible without any worker/diagnostic policy load.
- `human`: none required; optional manual OpenCode prompt smoke-test is not required to close this documentation change.

**Proposed commit message:** `refactor: limit delivery policy loading to delivery and planner`

## Required gates

- `architect_review: true` — the orchestrator-to-worker contract and ADR-0048 wording change a cross-role boundary; verify the amendment and each worker's self-sufficient handoff without weakening the accepted safety gates.
- `memory_update: true` — Task 2 updates ADR-0048; check memory freshness at plan close. No unrelated historical plans or memory files are to be rewritten.
