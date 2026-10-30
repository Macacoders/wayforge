# ADR-0048: Risk-Proportionate Delivery with Specialized Worker Roles

**Date**: 2026-10-27
**Status**: Accepted

## Context

Issue #231: every change, however small, travelled the full chain — intent, plan approval,
`/load-plan`, per-task implementation handoff, per-task review with gate checks and a memory
freshness pass, then a commit by `delivery`. Only `code` could write source, and only when handed a
pre-approved task, so even a `troubleshooter` with a confirmed root cause had to restart the chain.
Reviews could bounce a task back to implementation repeatedly, bounded only by prose asking the agent
to give up "a second time".

The ceremony lived in the skills and agent prompts, not the commands (`base/opencode/commands/*.md`
were 9–22 lines). `skills/plan/SKILL.md` mandated a five-step task template and 2–5 minute
granularity; `agents/delivery.md` performed its own review of the diff, so the implementer's
orchestrator was also the reviewer; `review-task.md` re-ran a memory close-check on every task.

## Decision

1. **Two entry paths, classified by risk.** `direct` (localized, low-risk correction) runs
   classification → bounded objective and acceptance criteria → `implementation` work order →
   agent-owned validation → independent review → commit, with no intent or plan artifact. `full`
   (ambiguous, multi-deliverable, or boundary-affecting) keeps intent + plan, then executes the
   approved plan autonomously. Classification lives in one place — the new `delivery-policy` skill —
   with conservative defaults (unknown risk is `full`), a user override that cannot cross a boundary
   trigger, and upward reclassification allowed at any time.

2. **Specialized roles with one shared protocol.** `planner` formalizes intent and plans; `delivery`
   dispatches, applies policy, integrates, and escalates; `code` implements; `reviewer` verifies
   criteria against evidence; `research` investigates; `architect` reviews boundaries at plan time.
   Work orders (`implementation`, `verification`, `architecture_review`, `research`) and the worker
   result format are defined once in `delivery-policy`; dispatchers send recipients the relevant
   work-order fields and expected result.

3. **Delivery owns the review gate but not the review.** Review moves out of `delivery` into the new
   read-only `reviewer` subagent. `delivery` never accepts a change from its own reading of the diff;
   the acceptance criteria are the contract, and each one must come back `pass` with the evidence that
   proves it, against a stated reviewed revision. A later change invalidates the evidence for the
   criteria it touches.

4. **Outcome-based task contracts replace procedural steps.** Plan tasks now carry ID, objective,
   context, acceptance criteria, constraints, dependencies, and validations. The five-step template,
   the 2–5 minute granularity rule, and the copy-the-Steps handoff are gone. Concrete technical
   detail (mandatory interfaces, invariants, known regressions, conventions) is still required where
   it matters. Dependencies and per-task `**Status:**` replace markdown ordering as the readiness
   signal; `task: <n>/<total>` survives as a compatibility cursor. Phases are optional milestones whose
   integration gate is explicit — never a scheduling barrier.

5. **Autonomous plan execution.** `/deliver-plan` runs the approved plan: eligible tasks by
   dependency, dispatch, verify criteria, commit, verify a phase gate where declared, plan-level
   acceptance. Routine successful transitions are not approval prompts. `/load-plan`,
   `/implement-task`, and `/review-task` remain as manual low-level steps.

6. **The loop stops on progress, not on a count.** A failing criterion is dispatched back as the same
   criterion with the evidence returned. A criterion that fails twice, or a round with no change in
   evidence, stops the loop with both rounds of evidence side by side plus the decision needed and the
   options. Evidence outside the criteria is recorded as a follow-up and never dispatched, so nothing
   can reopen an accepted task. (Amendment 2 replaced the original numeric budget.)

7. **Troubleshooter can hand off, not implement.** A confirmed root cause goes to `/deliver` as a
   bounded handoff; `troubleshooter` still does not edit or commit.

8. **One owning location per policy.** Risk tiers, work orders, result format, the verification
   contract, acceptance, the loop's stop rule, and commit authority live in
   `skills/delivery-policy/SKILL.md`. Task/phase craft lives in `skills/plan/SKILL.md`. `delivery`
   loads the policy and `planner` may consult it for classification; other roles receive the relevant
   work-order information or concise diagnostic routing guidance. The exceptions that are still
   restated are enumerated under "Deliberate Duplication" below, so they read as decisions rather
   than drift.

## Current Loop: Evidence and Classification

Verified against the pre-change files; used to decide what to keep, relax, or remove.

| # | Hop | Trigger / artifact | Stop point | Evidence | Verdict |
| - | --- | ------------------ | ---------- | -------- | ------- |
| 1 | Intent formalization | `/intent`; conversation artifact; user approval | every request | `commands/intent.md`, `skills/intent/SKILL.md` | **relax** — only `full`-path work |
| 2 | Plan authoring | `/plan`; `docs/ai/plans/*.md`; user approval | every request | `skills/plan/SKILL.md` (143 lines) | **relax** — only `full`-path work |
| 3 | Load plan | `/load-plan`; `task: <n>/<total>` cursor | every task | `commands/load-plan.md`, `agents/delivery.md:16` | **relax** — dependency-readiness in `/deliver-plan`; kept as manual step |
| 4 | Implementation handoff | `/implement-task`; copy of Objective/Files/Steps | every task | `commands/implement-task.md:8` | **remove** the copy-steps requirement → work-order contract |
| 5 | Implement one task | `code` child session; "exactly one approved task" | every task | `agents/code.md:9` | **keep** one bounded work order per child |
| 6 | Per-step manual pause | Step Loop + architecture rule | every atomic step | `agents/code.md:23-31`, `architecture.md` "Pause after each atomic step" | **remove** — evidence at work-order end |
| 7 | Task review by the orchestrator | `/review-task`; git evidence; `delivery` judges its own dispatched work | every task | `commands/review-task.md:6`, `agents/delivery.md:12` | **remove** the self-review; **keep** independent verification via `reviewer` |
| 8 | Boundary review | `architect` on 6 boundary categories | boundary changes | `agents/architect.md:26-35`, ADR-0025 | **keep**, moved to plan time as `architecture_review` |
| 9 | Gate checks + progress bump | `required_gates`, frontmatter `task:` | every task | `commands/review-task.md:14` | **relax** — at plan close, and per task only for gates the plan declares |
| 10 | Memory freshness | `/memory check` or `ai-memory close-check` | every task | `commands/review-task.md:16` | **relax** — plan close (`required_gates.memory_update`) |
| 11 | Commit | `delivery` commits accepted work | every task | `agents/delivery.md:17`, `agents/code.md:17` | **keep** — sole commit authority |
| 12 | Retry | prose: ask the user "a second time" | failing tasks | `agents/delivery.md:18`, `commands/review-task.md:8` | **remove** prose → progress-based stop rule (Amendment 2) |
| 13 | Edit/bash/external-directory permissions | `permissions/agents.yml` | always | `permissions/agents.yml:1-9`, ADR-0036 | **keep** — extended for `reviewer`; `code` gains commit/push/tag denies |
| 14 | Human-owned validations | plan-declared owner | always | `skills/plan/SKILL.md` "Validation Ownership" | **keep** |
| 15 | Duplicated rule copies | `delivery.md`, `review-task.md`, `architecture.md`, `plan` skill | — | grep across the four files | **remove** → one owning location per policy |

Safety boundaries kept: source-write authority (`code` only), commit authority (`delivery` only),
independent verification of the diff, destructive-command denies, repository boundary, human-owned
validation separation. Ceremony removed: mandatory intent/plan for small work, per-step approval,
per-task memory checks, prescribed coding sequences, and prose-only retry bounds.

## Scenario Walkthroughs

1. **Trivial fix** — `/deliver "fix the off-by-one in parseRange"`. Classification `direct` (one
   localized defect, existing tests cover it). Bounded objective + numbered criteria (`C1` = the
   existing test command passes for the new case), `implementation` work order, `verification` on the
   working-tree diff, every criterion evidenced, commit. No intent, no plan, no approval prompt.
2. **Ambiguous request** — `/deliver "make installs faster"`. No concrete defect; classification
   `full` with trigger "requirements ambiguous". `delivery` stops and routes to `/intent`, which asks
   one clarifying question at a time before anything is implemented.
3. **Failing test under diagnosis** — `troubleshooter` reproduces, narrows, and confirms the root
   cause. It hands off to `/deliver` with symptom, root cause, evidence, expected behaviour, and the
   command that must pass — no restart of the planning chain. If the cause turns out to sit in
   authentication or persistence, the handoff goes to `/plan` instead.
4. **Boundary-affecting change** — a schema/auth/public-contract change classifies `full` on the
   boundary trigger, so `/intent` → `/plan` runs and `planner` dispatches `architect` before the plan
   is approved. Contradictions are settled while changing them is still cheap, and the plan records
   any new decision. `delivery` reaches `architect` only for a `required_gates.architect_review` the
   plan declares.
5. **Review failure** — `reviewer` answers the criteria: `C1 pass — <evidence>`, `C2 fail — expected
   X, got Y at file:line`. `delivery` dispatches the same criteria back with that evidence; `code`
   changes only what `C2` needs and re-runs the named command; `reviewer` re-verifies `C2` and any
   criterion whose evidence the new diff touches.
6. **Repeated failure** — `C2` fails a second time, or the second round's evidence is unchanged.
   `delivery` stops with both rounds of evidence side by side, states whether the obstacle is the
   implementation, a missing dependency, or the approved scope, and asks for the decision. No third
   round is dispatched. The loop ends on lack of progress, not on a spent counter.
7. **Multi-task plan** — `/deliver-plan` reports state once, then works through tasks whose
   dependencies are `accepted`, committing and marking each `accepted`, verifying a phase's declared
   gate criteria once, recording follow-ups, and finishing with plan acceptance and a plan-level
   summary. The user is not asked anything on the happy path.
8. **Independent verification** — `reviewer` is a separate read-only subagent (`edit: deny`, no
   commit, mutating shell prefixes denied) that produces the evidence itself and answers criteria only.
   `delivery` cannot substitute its own diff reading for that evidence, and `code` cannot approve its
   own work.
9. **Reviewer keeps finding new things** — round 2 raises a defect outside the criteria. `reviewer`
   reports it as an `Outside the criteria:` note, `delivery` records it in the plan's `**Follow-ups:**`
   list, the task is accepted on its criteria, and the note is not dispatched. The optional finding
   costs one line instead of a repair round.
10. **Shared contract mismatch** — a task changes a generated config key another component consumes.
    The plan wrote that contract as `C3` with the command that proves compatibility, so the mismatch
    fails `C3` at task level with evidence instead of surfacing at the phase gate.

## Consequences

- A straightforward fix is delivered and independently validated in one command; risky work keeps
  intent, planning, and boundary review.
- Review is genuinely independent: the orchestrator no longer grades its own dispatch, the reviewer
  holds no write authority, and the reviewer's judgement is bounded by the criteria instead of by its
  own standard of quality.
- The loop terminates on evidence rather than on a counter: a criterion that will not move escalates
  on its second failure with both rounds of evidence, and a note outside the criteria is recorded as a
  follow-up instead of costing a round.
- Duplicated workflow prose collapses into `delivery-policy`, so policy changes touch one file.
- Plans are cheaper to write (no step scripts) but carry more structure (dependencies, per-task
  status, criteria with evidence, validations), which is the state `/deliver-plan` needs to schedule
  work.
- Terminology (`work order`, `kind`, `status`, `criterion`, `evidence`, `reviewed revision`) is stable
  enough to become the machine-readable contract of the planned 2.0 deterministic orchestrator. No
  queue, database, or scheduler is introduced now.

## Deliberate Compromises and Deferred Work

- **`code` keeps its agent id.** The role is *implementer* in the policy, but renaming the file would
  churn `permissions/agents.yml`, seven agent config fragments, CLI tests, install manifests, and
  every consuming project for no behavioural gain. `ADR-0042` (standing contract) still holds.
- **Progress state is markdown.** Per-task `**Status:**` plus the legacy `task:` cursor, nothing more.
  A real scheduler, parallel worktrees, and persisted work-order state stay 2.0 work.
- **Plans written before this ADR stay executable.** They have no per-task `**Status:**` or
  `**Depends on:**` fields (53 of 63 plans in this repository, 60 missing dependencies), so
  `delivery-policy` derives readiness from the frontmatter `task: <n>/<total>` cursor, treats a missing
  dependency as "after the previous task", backfills the fields while dispatching, drops the legacy
  `**Step 5: Commit**` instruction (17 plans carry it), and refuses to invent missing acceptance
  criteria. Old plans are not migrated by hand.
- **Retry budgets live in the conversation**, not in a file; no persistent retry-state infrastructure is introduced. A new, unrelated run starts its own budget, but resuming a paused task requires an authorized recovery handoff to carry any known used counts. A new session does not reset an exhausted paused-task budget: missing count evidence stops for the owner, and any extension must be explicitly authorized and finite. The operational handoff and budget rules stay in `delivery-policy`.
- **`reviewer` shell denies are prefix-based** and therefore bypassable by chained commands
  (`cat x && sed -i ...`), exactly as recorded for the rest of the matrix in ADR-0036. `edit: deny`
  is the primary control; the deny list reduces the obvious paths.
- **Commit authority is tool-enforced only for obvious verbs.** `code` gains `git commit*`,
  `git push*`, and `git tag*` denies so the documented boundary is no longer prose-only, but a
  chained or aliased
  command still bypasses a prefix deny list (ADR-0036). Shell-level enforcement of "only `delivery`
  commits" needs the OS sandbox, not this file.
- **Human-owned validations are still only reported**, not enforced by tooling; plan-level acceptance
  trusts the user's confirmation.
- **`/deliver` and `/deliver-plan` are two commands** rather than one dispatcher, so the user's
  intent (fix now vs execute plan) is unambiguous at the entry point.

## Deliberate Duplication

Three rules remain stated in more than one file. Each is intentional; anything else that duplicates
is drift to be collapsed back into `delivery-policy`. Receiving the relevant work-order fields is not
a duplicate policy definition or a requirement for a worker to load the policy.

1. **Human-owned validations are never executed by agents** — `delivery-policy` states the rule;
   `plan` (ownership model), `code` (what it must not run), `/deliver`, and `/deliver-plan` restate it
   in one line at the point of use. This is the same reasoning as ADR-0021's Repository Boundary exception: an agent that reads only its own file must not be able to run a supervised command by
   omission, and the cost of the restatement is one clause.
2. **The reviewer's output fields** — the receiver's expectation lives in `delivery-policy`; the
   producer's contract lives in `agents/reviewer.md`. Constraint (AC5) requires each agent definition to
   be self-sufficient, so a reviewer that cannot see the policy still returns usable evidence. Any
   future change must update both, and the shared vocabulary (`criterion`, `evidence`,
   `reviewed revision`) is what the 2.0 contract will formalise.
3. **Commit authority** — `delivery-policy` owns the rule; `delivery.md` states its own authority and
   `/review-task` says who commits. This is the one boundary a reader cannot infer from context.

The stop-condition list, by contrast, is *not* duplicated: it lives only in `delivery-policy`, and
`delivery.md`, `docs/ai/architecture.md`, and the commands reference it.

## Amendment (2026-10-27)

The original decision used "referenced everywhere" and said agent files point at the policy. That
wording was intended to preserve one owner for the shared protocol, but it overextended policy loading
to workers and diagnostic roles that only need a bounded handoff. The policy remains its single owner:
`delivery` loads it, and `planner` may consult it for classification. Dispatchers instead provide
workers the relevant work-order information and expected result; diagnostic roles use concise,
advisory routing guidance. A troubleshooter or triager can recommend `/deliver` for a confirmed local
fault or `/plan` for a known boundary or uncertain risk, while `/deliver` retains authoritative risk
classification. This amendment does not change independent review, acceptance gates, or the shared
work-order protocol.

## Amendment (2026-10-29): Evidence-Based Review and Delivery Recovery

This amendment clarifies independent review, finding resolution, shared-contract verification, and paused-delivery recovery while preserving the existing role separation, retry budgets, and conversational-only retry state established by ADR-0048.

### 1. Evidence-based findings and ambiguity resolution

Independent reviews must report the inspected revision and provide evidence for each blocking finding.

Findings distinguish violations of approved criteria or invariants, demonstrable correctness/reliability/security defects, underspecified requirements, architectural conflicts, preferences, and optional improvements.

A criterion that cannot be reliably judged is reported as `unverifiable` rather than incorrectly marked as failed.

`delivery-policy` remains the authoritative source for finding classification and resolution.

`delivery` coordinates conflicting functional and architecture reviews but cannot override substantiated independent findings, invent acceptance criteria, or change approved plans.

Missing product or architectural decisions follow the authorized clarification process. Clarification is not a repair dispatch and does not extend review or repair budgets.

Material changes to approved contracts or architecture require owner approval and appropriate current independent verification.

### 2. Early shared-contract compatibility

When a task affects a shared configuration constraint, resource budget, API schema, serialization format, or integration assumption, the existing functional review includes focused compatibility evidence.

The work order identifies the available counterpart or explicitly documented contract.

Concrete incompatibilities must identify both sides and the violated contract. Unavailable future components are reported as integration risks, not presumed passes or failures.

Underspecified expectations follow the clarification process rather than becoming invented requirements.

This introduces no additional global or task-level review gate. Unaffected tasks retain normal independent review, and declared phase integration reviews remain mandatory.

### 3. Paused-delivery recovery

Re-entering `/deliver-plan` first reconstructs the state of every `in-progress` task, including:

- Implementation and repair dispatch counts.
- Validation results and inspected revisions.
- Functional and architecture review outcomes.
- Outstanding decisions and authorizations.
- Ownership of uncommitted changes.
- Commit and acceptance status.

Delivery resumes from the next authorized action rather than restarting implementation.

Previously completed gates remain valid only for their applicable unchanged revision.

A task must never be rewritten to `pending`, receive a reset repair budget, or lose uncommitted work merely because the workflow restarted.

Missing, inconsistent, or contradictory recovery evidence requires an explicit owner decision.

This recovery uses existing conversation context, handoffs, repository evidence, and delivery logs. It does not introduce persistent retry infrastructure.

### 4. Resume ordering and phase integration gates

Recovery follows the established gate order:

1. Complete or resume the already-authorized implementation.
2. Obtain required validation evidence.
3. Complete pending functional review.
4. Complete required architecture review.
5. Commit and accept the task once all applicable gates pass.

A current functional pass with architecture review pending resumes at architecture review, not functional review.

A task with all required reviews passed and commit pending proceeds directly to acceptance and commit.

An authorized implementation revision change invalidates affected validation and review evidence, requiring appropriate revalidation and fresh review.

Unexplained revision changes or contradictory evidence fail closed.

Pending phase integration reviews do not block otherwise eligible independent task work. However, every declared phase integration gate must be satisfied before plan completion.

A previously passed phase gate remains valid for unchanged accepted revisions. Failed or blocked gates follow the approved bounded resolution process; additional reviews beyond the authorized budget require explicit approval.

### 5. Preserved invariants

This amendment does not change:

- Independent functional and architecture review responsibilities.
- Delivery-only commit and integration authority.
- Existing task and phase acceptance requirements.
- One implementation plus two normal repairs per task.
- Existing architecture and integration review budgets.
- Requirement for explicit authorization of additional repairs or reviews.
- Conversational-only retry state under ADR-0048.
- The prohibition on silently changing approved scope or acceptance criteria.

Detailed paused-delivery transition scenarios and cross-component compatibility examples belong in harness regression documentation rather than this ADR.

## Supersedes and Amends

- Supersedes ADR-0038: `delivery` is no longer a thin three-command task orchestrator; it is the
  policy-applying orchestrator with autonomous plan execution and a dedicated reviewer.
- Amends ADR-0026 and ADR-0043: plan frontmatter keeps `status`/`created`/`required_gates`, keeps
  `task:` as a compatibility cursor, and adds per-task `**Status:**` and `**Depends on:**` as the
  readiness source. "Task" and "step" vocabulary from ADR-0043 is unchanged.
- Amends ADR-0023: the Discovery checkpoint still governs planning, but `direct`-path work no longer
  enters planning at all, so it never hits that checkpoint.
- Confirms ADR-0025 (`architect` boundary categories), ADR-0036 (coarse permission model) and
  ADR-0042 (`code` holds a standing contract) with the extensions noted above.

## Related

- Issues #231, #264, #265.
- Skills: `base/opencode/skills/delivery-policy/SKILL.md`, `base/opencode/skills/plan/SKILL.md`.
- Agents: `delivery`, `reviewer`, `code`, `planner`, `troubleshooter`, `research`, `architect`.
- Commands: `/deliver`, `/deliver-plan`, `/load-plan`, `/implement-task`, `/review-task`.
