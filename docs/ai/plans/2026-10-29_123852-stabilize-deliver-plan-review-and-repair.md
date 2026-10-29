---
status: completed
created: 2026-10-29
task: 3/3
required_gates:
  architect_review: true
  memory_update: true
---

# Stabilize `/deliver-plan` review and repair — implementation plan (awaiting approval)

**Goal:** Make review findings evidence-based, resolve genuine contract ambiguity without speculative repairs, converge on bounded repairs, and catch relevant shared-contract mismatches before task acceptance without weakening independent review.

**Architecture:** Extend the existing prose work-order and acceptance policy in `base/opencode/skills/delivery-policy/SKILL.md`, with thin routing in commands and recipient-specific output guidance in agents. Keep the existing reviewer, architect, code, and delivery authorities; use a compact within-run finding ledger carried in handoffs rather than persistence or a new orchestrator. Preserve task, phase, and plan gates and the existing numeric budgets.

**Tech Stack:** OpenCode agent/command/skill Markdown templates; `docs/ai/` ADR and plan memory; existing Vitest/CLI validation where testable. Source templates live under `base/opencode/**`; root `.opencode/**` and `opencode.jsonc` are generated and must not be edited.

**Scope classification:** multi-task (three independently reviewable outcomes). **Risk:** full — changes the shared review/work-order contract, plan acceptance, and repair authorization boundary. **Priority:** Task 1 and Task 2 P0; Task 3 P1.

**Approval boundary:** This is a planning artifact, not implementation authorization. Keep `korai-mad` paused; do not edit its repository, approved plan, or review history. Do not edit PR #255 or GitHub Issues as part of approving this file. Delivery may start only after the user approves this plan and the selected PR/issue routing.

## Grounding and backlog route

- Verified in this repository: `base/opencode/skills/delivery-policy/SKILL.md` owns work orders, verdicts, revision matching, acceptance gates, retry counts and stop conditions. `base/opencode/commands/deliver-plan.md` dispatches functional and conditional architecture review, accepts after a pass, and runs declared phase integration reviews. `base/opencode/commands/review-task.md` is the manual path for the same review loop. `base/opencode/agents/reviewer.md` treats unjudgeable criteria as `blocked`; `base/opencode/agents/architect.md` reviews architecture boundaries; `base/opencode/agents/code.md` repairs one bounded work order. `base/opencode/skills/plan/SKILL.md` owns task/phase contract craft. `docs/ai/decisions/ADR-0048-risk-proportionate-delivery-workflow.md` explicitly keeps retry state conversational and reserves review/commit authority.
- Issues [#264](https://github.com/Macacoders/wayforge/issues/264) and [#265](https://github.com/Macacoders/wayforge/issues/265) are open backlog homes for Tasks 2 and 3. Issue #231 and open [PR #255](https://github.com/Macacoders/wayforge/pull/255) introduced the underlying proportionate workflow. The two issues currently say to extend PR #255; **this plan does not authorize that expansion**. Recommend a **separate issue and PR for Task 1**: ambiguity resolution changes the shared reviewer/architect/delivery decision contract and merits an independently reviewable P0 change. After plan approval, ask the PR owner to confirm whether #264 and #265 remain suitable for PR #255 or deserve separate follow-ups; update their routing only with authorization. Do not close any issue just because #255 merges.
- `korai-mad` incidents (Task 2 runtime/numeric defects, Phase 1 shared limits, Task 3 adjacent artifact-validation findings, and identity-versus-digest precedence) are reported by the user, **not verified against that external repository**. The identity/digest scenario is a harness adjudication regression scenario, not a ruling on the artifact's actual error precedence.
- Existing `cli/tests/unit/permissions.test.ts` guards dispatch permissions and review/commit role separation, not semantic review convergence. ADR-0048 uses scenario walkthroughs. Add targeted automated assertions only where the behavior is meaningfully checkable; accompany prose-only orchestration rules with explicit scenario walkthroughs rather than asserting that static tests prove agent behavior.

## Finding contract and decision table (Task 1 establishes this)

Each actionable finding carries: stable within-run finding ID; review kind, task and inspected revision/diff; affected contract and validation boundary; **category** (`explicit_requirement`, `demonstrable_defect`, `underspecified_requirement`, `architectural_conflict`, `architectural_preference`, `optional_improvement`); severity/blocking disposition; citation to approved criterion/contract **or** reproducible correctness, reliability or security rationale and evidence; concrete location; relation to prior findings (`new`, `persisting`, `regression`, `changed_expectation`) when applicable; recommended route and decision owner. A defect may be blocking without a previously enumerated acceptance criterion. A category alone is never a severity verdict. Do not expose unnecessary sensitive artifact contents in reports.

Keep worker verdicts `pass | changes_required | blocked` and revision-specific evidence. Per-criterion reporting must represent **unjudgeable** without falsely recording `fail` (a compatible extension to the current `ACn pass|fail` form); old results remain readable. Findings and dispositions are concise within-run handoff context, not a new persistent database or authority to rewrite a plan.

| Finding / evidence | Review outcome and next action | Decision authority |
| --- | --- | --- |
| Explicit approved criterion or documented contract violated, with citation and evidence | Blocking `changes_required`; bounded repair and fresh review, or exhaustion path | Independent functional reviewer identifies; `delivery` routes, does not overrule |
| Demonstrable correctness, reliability, or security defect, with concrete impact/evidence even if unforeseen by the plan | Blocking `changes_required`; repair within scope, or stop for plan/safety decision if scope changes | Independent reviewer identifies; architecture reviewer assesses boundary implications; owner approves material scope change |
| Requirement is underspecified or two implementations satisfy the documented contract, with no established defect | `blocked` when judgment needs a new requirement; no code repair solely for preference; clarify and then independently review against the approved interpretation | Authorized project owner chooses product behavior; `planner` revises approved intent/plan if material; `delivery` cannot invent criteria |
| Minor implementation choice within approved architecture, with no material behavior/security/compatibility consequence | Not blocking; note preference only if useful; proceed if all required gates pass | Implementer chooses within approved scope; reviewer cannot promote preference to a requirement |
| Architectural conflict with an ADR/invariant or unresolved architectural choice | `changes_required` for a demonstrated conflict; `blocked` if required facts/decision are missing; stop for architecture adjudication | `architect` provides independent evidence; owner approves material plan/ADR change |
| Functional and architecture conclusions conflict, or a finding contradicts a recorded decision | Hold acceptance; compare criterion, impact, inspected revisions, and prior decision; classify using the rows above; do not automatically favor a passing reviewer | `delivery` coordinates evidence, independent roles retain verdicts; relevant owner decides contract or architecture change; fresh review of affected revision after resolution |
| Optional improvement, unrelated pre-existing issue, or unsupported preference | Non-blocking, outside the verdict; may be tracked separately | Reviewer reports with evidence; no implicit task-scope expansion |

**Ambiguity decision flow:** (1) Check that both reviews concern the same relevant revision and approved task contract; stale results require fresh review of the touched scope. (2) Ask for the cited criterion or demonstrable defect rationale, including security implications; do not dismiss a new valid defect because tests or an earlier reviewer passed. (3) If the approved contract settles it, use that contract and preserve independent review; if the choice is minor and materially equivalent, leave it to the implementation within approved architecture. A disputed blocking finding remains unresolved until the independent reviewer reclassifies it on evidence or the authorized owner resolves the contract; `delivery` cannot downgrade it unilaterally. (4) For new product behavior, stop for project-owner clarification; for architectural ambiguity, use the existing architecture-review gate, and seek owner approval if plan/ADR changes materially. (5) Record the decision and its authority in the appropriate plan/ADR before it becomes a new acceptance expectation; `delivery` cannot rewrite plan task bodies. (6) Resume only with required validation and a current independent verdict; any additional review dispatch beyond a policy budget requires explicit authorization. Clarification alone is not a repair dispatch and never silently extends a repair or review budget.

**Identity/digest scenario:** Given an artifact with both invalid identity and invalid embedded digest, the harness inspects the actual approved artifact contract and security rationale. If precedence is specified or one order has a demonstrated security/correctness impact, enforce it with evidence. If both orders are valid under the approved contract, do not block on a reviewer's preferred order; if product behavior needs a new guarantee, obtain an owner-approved clarification before judging it. An architecture `pass` does not negate a valid functional defect, and local tests do not settle an unspecified contract.

## Plan acceptance criteria

- The three outcomes below are separately verifiable and the finding table and ambiguity flow are consistent across `/deliver-plan`, `/review-task`, delivery policy, reviewer, architect, and code handoffs where relevant.
- Explicit or demonstrated defects stay blocking; underspecification does not become a fabricated criterion; functional/architecture disagreement has a finite, evidence-based decision route.
- The 1 implementation + 2 repair limit per task, one integration review per phase gate, and one architecture review per boundary category per revision remain the defaults. A blocked task is never accepted, required gates are never waived silently, and no extra dispatch or budget reset occurs without explicit authorization; any extension names task, finding scope, and a finite additional count.
- Risk-selected shared-contract checks and phase integration reviews both operate; unaffected tasks avoid a mandatory extra integration review.
- The migration procedure below is documented and checked against a *synthetic* paused-delivery scenario; no `korai-mad` execution or plan edit is required to accept this harness plan. Actual `korai-mad` recovery is a later, separate, human-owned authorization.
- A boundary-sensitive independent architecture review passes against ADR-0048 and related decisions; ADR-0048 is amended to record the authorized handoff of known counts across paused sessions and any other finalized changes to its decisions, without moving operational policy out of `delivery-policy`.

### Task 1: Evidence-based findings and ambiguity adjudication (P0)

**Status:** accepted
**Depends on:** none

**Objective:** Produce one consistent, independently reviewable finding/evidence contract and a finite resolution path for unjudgeable criteria and conflicting functional/architecture conclusions. Preserve the independent reviewer verdict and the approved plan as acceptance authorities.

**Context:** `base/opencode/skills/delivery-policy/SKILL.md` (shared work orders, result and gate semantics); `base/opencode/commands/deliver-plan.md` and `review-task.md` (autonomous/manual verdict application); `base/opencode/agents/reviewer.md`, `architect.md`, `delivery.md` (role-specific recipient/output guidance); `base/opencode/skills/plan/SKILL.md` (criteria must be observable); ADR-0048 (single policy owner and review independence). The command currently describes applying the functional verdict but does not explicitly reconcile a conflicting architecture verdict.

**Acceptance criteria:**
- Blocking findings cite an explicit approved requirement or present reproducible correctness, reliability or security evidence, with inspected revision; suggestions/preferences are separated from blocking findings.
- Unjudgeable criteria and two valid implementations yield a clear non-repair decision route without inventing an AC. Product owner, architect and plan-approval authorities follow the decision table; minor equivalent choices remain within the implementer's approved discretion.
- Conflicting functional/architecture results, changed expectations and stale revisions prevent acceptance until their evidence and authority are reconciled; neither reviewer is automatically favored, and no earlier pass suppresses a later real defect.
- The identity/digest scenario has both branches (documented/defective precedence versus unspecified/materially equivalent precedence) and does **not** assert which order is correct for `korai-mad`.
- An ambiguity clarification does not itself consume a repair dispatch or grant an extra review dispatch; a material contract change receives owner approval and a current independent review before acceptance.

**Constraints:** Policy owner remains `delivery-policy`; commands remain thin, workers receive self-contained bounded handoffs. Reuse existing `blocked` verdict for unjudgeable reviews, existing architect role and plan approval, and existing `pass/changes_required/blocked` verdict vocabulary. Do not edit consumer plans or `korai-mad`; do not introduce new worker roles, a state store, or an automatic adjudicator. Amend ADR-0048 only for a real durable change to its decision. Do not introduce a new mandatory global gate.

**Validations:**
- `agent`: `make check` — expected: repository validation passes; report any unrelated pre-existing failure separately.
- `agent`: scenario walkthroughs against the updated policy for explicit violation, unforeseen security/reliability defect, unspecified error precedence, two valid implementations, functional/architecture disagreement, changed criterion and stale reviewed revision — expected: table outcomes and owner authority agree across commands and agents.

**Proposed commit message:** `feat: resolve ambiguous independent review findings`

### Task 2: Boundary-complete repairs and bounded convergence (P0, #264)

**Status:** accepted
**Depends on:** Task 1

**Objective:** Extend the existing repair cycle so related trust-boundary failures are assessed together, findings remain identifiable across rounds, and exhaustion produces one actionable diagnosis with no unauthorized additional repair.

**Context:** `base/opencode/skills/delivery-policy/SKILL.md` (repair work order, budgets and escalation); `base/opencode/commands/deliver-plan.md`, `review-task.md` (autonomous/manual repair loops); `base/opencode/agents/code.md`, `reviewer.md` (repair and independent verification); Task 1 finding IDs/classification; issue #264 (existing acceptance criteria). The policy's budgets live in the conversation, not a file (`ADR-0048:143-157`).

**Acceptance criteria:**
- Repair handoffs carry current/prior finding IDs, relevant prior decisions and affected boundary. For parsing, validation, authentication and analogous trust-sensitive code, the implementer reports a bounded audit of adjacent failure modes, justified adversarial regression coverage (or reason omitted), and distinguishes incorrect test expectations from implementation defects.
- Required agent-owned validations run before independent review; failures or missing evidence stop dispatch with a clear result. Human-owned validations are reported, never agent-executed. A repair is reviewed against its **new** revision.
- Cross-round findings are marked `new`, `persisting`, `regression`, or `changed_expectation`, with a disposition and evidence; no legitimate newly discovered correctness/security defect is suppressed because an earlier review passed.
- At exhaustion, classify blockers as implementation defect, external dependency, architectural conflict, or contract ambiguity as appropriate; report evidence, affected scope, complexity, attempts used, and one recommended owner/decision. A small local defect may receive only an explicitly user-authorized extension naming task, scope and finite extra dispatches; repeated requests for the same boundary are consolidated, and the original tally remains visible.
- External blockers may be recommended for deferral only if plan dependencies and approved gates allow unrelated ready work; no blocked task becomes accepted. Material scope or architectural conflicts return to plan/owner approval. Default numeric budgets, independent reviews, integration/architecture review limits and commit authority remain unchanged.

**Constraints:** Reuse Task 1 classification; keep within-run handoff context compact and do not persist a new ledger/queue. Never equate a new run with authorization to repeat exhausted repairs: the recovery handoff below carries known counts; missing count evidence is a stop for the owner. Never automatically dispatch more reviews after a limited architecture/integration review budget without explicit user authorization. Do not convert a defect into a preference on the basis of past test passes.

**Validations:**
- `agent`: `make check` — expected: repository validation passes; report any unrelated pre-existing failure separately.
- `agent`: scenario walkthroughs for adjacent invalid artifact cases, defective test versus code, introduced regression, repeated boundary finding, validation failure before review, exhausted budget with/without finite authorization, external deferral and new-run recovery — expected: bounded routes with preserved counts and fresh review evidence.

**Proposed commit message:** `feat: converge repairs with bounded exhaustion diagnostics`

### Task 3: Risk-selected shared-contract evidence before acceptance (P1, #265)

**Status:** accepted
**Depends on:** Task 1

**Objective:** Include focused compatibility evidence at task acceptance when an affected shared contract exists, without requiring unrelated tasks to undergo a full integration gate.

**Context:** `base/opencode/skills/delivery-policy/SKILL.md` (task versus phase acceptance); `base/opencode/commands/deliver-plan.md`, `review-task.md` (before-acceptance path); `base/opencode/agents/reviewer.md` (independent evidence); `base/opencode/skills/plan/SKILL.md` (task context/contracts and declared integration gates); issue #265 (existing acceptance criteria); Task 1 finding categories. Existing phase integration reviews run after declared phases and must remain.

**Acceptance criteria:**
- Changes affecting shared configuration constraints, resource budgets, API schemas, serialization or integration assumptions select a focused compatibility check against available components or **explicitly documented** contracts; missing future-component evidence is an identified integration risk, not an invented pass or default failure.
- A concrete incompatibility is an evidence-backed review finding with both sides and violated contract identified; it blocks task acceptance when the documented requirement or demonstrable defect warrants it. Underspecified shared expectations route via Task 1 instead of being manufactured by the reviewer.
- Tasks without applicable shared-contract risk proceed through ordinary independent review without a new full-suite integration gate. Declared phase gates, dependency readiness, required validations and architecture review remain effective.
- Scenario walkthroughs demonstrate shared configuration, resource limits, schema/serialization mismatch, unavailable future counterpart and unrelated task; early checks do not declare a whole phase accepted.

**Constraints:** Reuse existing work-order context and task-review gate instead of inventing a new worker or global gate. Follow the existing plan's requirements without retroactively adding acceptance criteria; owner approval is required for material contract changes. Keep generated runtime outputs and paused consumer plans untouched.

**Validations:**
- `agent`: `make check` — expected: repository validation passes; report any unrelated pre-existing failure separately.
- `agent`: scenario walkthroughs for the acceptance cases above, including a declared phase integration gate — expected: focused checks before task acceptance where applicable, phase gate still runs and unaffected tasks have no added gate.

**Proposed commit message:** `feat: check shared contracts before task acceptance`

## Compatibility and paused-delivery recovery (required for plan acceptance)

1. **No automatic migration of consumer plans.** Legacy tasks without per-task status/dependencies remain supported under `delivery-policy`'s ADR-0048 compatibility rules. Accepted task statuses, approved criteria, reviews and commits are not rewritten. The richer finding fields apply to new review handoffs; historical verdicts stay valid for their original revision and scope, not as blanket approval of changed work.
2. **Human-supervised inventory before resuming `korai-mad`:** project owner supplies/authorizes inspection of its approved plan, paused task/phase statuses, commit/reviewed revisions, reviewer and architect verdicts/findings, validations, used implementation/repair/integration/architecture counts and explicit prior authorizations. Agents do not access that external repository under this plan. Record a compact recovery handoff in the consuming project's authorized workflow or conversation, not in a new Wayforge database.
3. **Reconcile without rewriting history:** compare the handoff with the existing approved contract; classify unresolved findings using Task 1, identify exhausted limits using Task 2, check revision validity and uncompleted declared gates. If history/counts are incomplete, stop for an owner decision; do not assume a fresh budget or retroactively mark blocked work accepted. If the approved contract changes, have its authorized owner approve the revised plan/criteria before any repair, and obtain a fresh independent review on affected revisions.
4. **Explicit resume decision:** only after the harness plan is approved and implemented, the recovery handoff is reviewed by the project owner, and any necessary bounded extensions or contract clarifications are authorized may delivery resume the paused task. Preserve `delivery`-only commit authority and `code`/`reviewer`/`architect` separation throughout. **Later human-owned operation, outside this harness plan's acceptance gates:** the `korai-mad` project owner conducts the recovery review; expected outcome is a documented go/no-go decision with preserved counts/history and no silent re-acceptance.

## Risks and safeguards

- **Overclassification or reviewer preference masquerading as a defect:** insist on cited approved requirements or reproducible correctness/reliability/security rationale; `blocked` and owner clarification handle genuine underspecification.
- **Adjudicator becoming self-review:** `delivery` routes and records authority; only independent reviewer/architect provide technical verdicts; product/plan owner approves new behavioral scope. An architecture pass never cancels a substantiated functional failure.
- **Review-round drift and budget circumvention:** carry compact IDs/dispositions and revision evidence; retain numeric limits, explicit finite authorizations and conservative recovery from missing counts; a new finding is still assessed on its merits.
- **Premature task acceptance or over-testing:** focused existing-contract evidence where relevant, not unconditional phase-level integration on every task; preserve declared phase gate and treat missing future components as risks.
- **Repository and PR scope:** no new scheduler/persistence, no generated-file edits, no automatic PR #255 expansion; separately review Task 1 and decide #264/#265 routing with the PR owner after approval. Do not conflate this plan's high priority with the issues' existing medium-priority labels without an explicit backlog decision.
