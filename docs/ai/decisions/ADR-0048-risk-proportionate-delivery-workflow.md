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
   dispatches, applies policy, integrates, and escalates; `code` implements and repairs; `reviewer`
   verifies independently; `research` investigates; `architect` reviews boundaries. Work orders
   (`implementation`, `repair`, `functional_review`, `integration_review`, `architecture_review`,
   `research`) and the worker result format are defined once in `delivery-policy`; dispatchers send
   recipients the relevant work-order fields and expected result.

3. **Delivery owns the review gate but not the review.** Review moves out of `delivery` into the new
   read-only `reviewer` subagent. `delivery` never accepts a change from its own reading of the diff;
   a verdict (`pass | changes_required | blocked`) plus the reviewed revision is required. A later
   change invalidates verdicts for the touched scope.

4. **Outcome-based task contracts replace procedural steps.** Plan tasks now carry ID, objective,
   context, acceptance criteria, constraints, dependencies, and validations. The five-step template,
   the 2–5 minute granularity rule, and the copy-the-Steps handoff are gone. Concrete technical
   detail (mandatory interfaces, invariants, known regressions, conventions) is still required where
   it matters. Dependencies and per-task `**Status:**` replace markdown ordering as the readiness
   signal; `task: <n>/<total>` survives as a compatibility cursor. Phases are optional milestones whose
   integration gate is explicit — never a scheduling barrier.

5. **Autonomous plan execution.** `/deliver-plan` runs the approved plan: eligible tasks by
   dependency, dispatch, verify, repair, commit, integration review where declared, plan-level
   acceptance. Routine successful transitions are not approval prompts. `/load-plan`,
   `/implement-task`, and `/review-task` remain as manual low-level steps.

6. **Deterministic retry and escalation.** Numeric budgets per run (1 implementation dispatch plus up to 2 repairs per task, 1 integration
   review per phase gate, 1 architecture review per boundary category per revision) replace the
   "ask a second time" prose. Exhaustion stops the
   loop with a fixed escalation shape: what was attempted, what failed with evidence, what was
   tried, the decision needed, and the options. Budgets never reset silently.

7. **Troubleshooter can hand off, not implement.** A confirmed root cause goes to `/deliver` as a
   bounded handoff; `troubleshooter` still does not edit or commit.

8. **One owning location per policy.** Risk tiers, work orders, result format, acceptance gates,
   retry budget, and commit authority live in `skills/delivery-policy/SKILL.md`. Task/phase craft
   lives in `skills/plan/SKILL.md`. `delivery` loads the policy and `planner` may consult it for
   classification; other roles receive the relevant work-order information or concise diagnostic
   routing guidance. The exceptions that are still restated are enumerated under "Deliberate
   Duplication" below, so they read as decisions rather than drift.

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
| 8 | Boundary review | `architect` on 6 boundary categories | boundary changes | `agents/architect.md:26-35`, ADR-0025 | **keep** — reused as `architecture_review` |
| 9 | Gate checks + progress bump | `required_gates`, frontmatter `task:` | every task | `commands/review-task.md:14` | **relax** — at plan close, and per task only for gates the plan declares |
| 10 | Memory freshness | `/memory check` or `ai-memory close-check` | every task | `commands/review-task.md:16` | **relax** — plan close (`required_gates.memory_update`) |
| 11 | Commit | `delivery` commits accepted work | every task | `agents/delivery.md:17`, `agents/code.md:17` | **keep** — sole commit authority |
| 12 | Retry | prose: ask the user "a second time" | failing tasks | `agents/delivery.md:18`, `commands/review-task.md:8` | **remove** prose → numeric budget + escalation shape |
| 13 | Edit/bash/external-directory permissions | `permissions/agents.yml` | always | `permissions/agents.yml:1-9`, ADR-0036 | **keep** — extended for `reviewer`; `code` gains commit/push/tag denies |
| 14 | Human-owned validations | plan-declared owner | always | `skills/plan/SKILL.md` "Validation Ownership" | **keep** |
| 15 | Duplicated rule copies | `delivery.md`, `review-task.md`, `architecture.md`, `plan` skill | — | grep across the four files | **remove** → one owning location per policy |

Safety boundaries kept: source-write authority (`code` only), commit authority (`delivery` only),
independent verification of the diff, destructive-command denies, repository boundary, human-owned
validation separation. Ceremony removed: mandatory intent/plan for small work, per-step approval,
per-task memory checks, prescribed coding sequences, and prose-only retry bounds.

## Scenario Walkthroughs

1. **Trivial fix** — `/deliver "fix the off-by-one in parseRange"`. Classification `direct` (one
   localized defect, existing tests cover it). Bounded objective + criteria, `implementation` work
   order, `npx vitest run path` evidence, `functional_review` on the working-tree diff, `pass`,
   commit. No intent, no plan, no approval prompt.
2. **Ambiguous request** — `/deliver "make installs faster"`. No concrete defect; classification
   `full` with trigger "requirements ambiguous". `delivery` stops and routes to `/intent`, which asks
   one clarifying question at a time before anything is implemented.
3. **Failing test under diagnosis** — `troubleshooter` reproduces, narrows, and confirms the root
   cause. It hands off to `/deliver` with symptom, root cause, evidence, expected behaviour, and the
   command that must pass — no restart of the planning chain. If the cause turns out to sit in
   authentication or persistence, the handoff goes to `/plan` instead.
4. **Boundary-affecting change** — a schema/auth/public-contract change classifies `full` on the
   boundary trigger, so `/intent` → `/plan` runs, and the plan's `required_gates.architect_review`
   dispatches `architect` before the task is accepted.
5. **Review failure** — `reviewer` returns `changes_required` with severity/evidence/location;
   `delivery` dispatches one `repair` work order carrying those findings; `code` reports which
   findings are resolved; `reviewer` reviews the new revision (verdicts carry the reviewed revision).
6. **Repeated failure** — the second repair still fails review. Budget is exhausted, so `delivery`
   stops and asks one question: what was attempted, what failed with evidence, what was tried, the
   decision needed, the options. No further round is dispatched.
7. **Multi-task plan** — `/deliver-plan` reports state once, then works through tasks whose
   dependencies are `accepted`, committing and marking each `accepted`, running `integration_review`
   after a phase that declares an integration gate, and finishing with plan acceptance checks and a
   plan-level summary. The user is not asked anything on the happy path.
8. **Independent review** — `reviewer` is a separate read-only subagent (`edit: deny`, no commit,
   mutating shell prefixes denied) with the implementer's report as supporting information only.
   `delivery` cannot substitute its own diff reading for a verdict, and `code` cannot approve its own
   work.

## Consequences

- A straightforward fix is delivered and independently validated in one command; risky work keeps
  intent, planning, and boundary review.
- Review is genuinely independent: the orchestrator no longer grades its own dispatch, and the
  reviewer holds no write authority.
- No step can repeat without bound; escalation is a concrete user-facing question with options.
- Duplicated workflow prose collapses into `delivery-policy`, so policy changes touch one file.
- Plans are cheaper to write (no step scripts) but carry more structure (dependencies, per-task
  status, validations), which is the state `/deliver-plan` needs to schedule work.
- Terminology (`work order`, `kind`, `status`, `verdict`, `reviewed revision`) is stable enough to
  become the machine-readable contract of the planned 2.0 deterministic orchestrator. No queue,
  database, or scheduler is introduced now.

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
- **Retry budgets live in the conversation**, not in a file; no persistent retry-state
  infrastructure is introduced. A new, unrelated run starts its own budget, but resuming a paused
  task requires an authorized recovery handoff to carry any known used counts. A new session does
  not reset an exhausted paused-task budget: missing count evidence stops for the owner, and any
  extension must be explicitly authorized and finite. The operational handoff and budget rules stay
  in `delivery-policy`.
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
   be self-sufficient, so a reviewer that cannot see the policy still returns a usable verdict. Any
   future change must update both, and the shared vocabulary (`verdict`, `reviewed revision`) is what
   the 2.0 contract will formalise.
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

## Amendment (2026-10-29)

The shared protocol now requires revision-specific, evidence-backed finding records and represents an
unjudgeable criterion without falsely marking it failed. `delivery-policy` remains the sole owner of
finding classification and reconciliation: delivery coordinates conflicting functional and architecture
evidence but cannot overrule an independent substantiated finding, invent a criterion, or rewrite an
approved plan. Clarification is not a repair dispatch or a budget extension; material contract or
architecture changes require the authorized owner and a current independent review. This preserves the
existing verdict vocabulary, retry limits, role separation, and conversational-only retry state.

## Amendment (2026-10-29, shared-contract evidence)

Task acceptance now includes focused compatibility evidence when a change affects a shared
configuration constraint, resource budget, API schema, serialization format, or integration
assumption. The existing functional-review work order names the available counterpart or explicitly
documented contract; a concrete mismatch identifies both sides and the violated contract. Missing
future-component evidence is reported as an integration risk rather than an inferred pass or failure,
and underspecification follows the existing owner-resolution route. This is not a new global or
integration gate: unaffected tasks retain ordinary independent review, and declared phase integration
reviews remain the only phase-acceptance mechanism.

## Amendment (2026-10-29, paused delivery recovery)

Re-entering `/deliver-plan` inventories every in-progress task's preserved dispatch tally, validation
and revision-specific review evidence, pending decision, and ownership of uncommitted work before any
fresh dispatch. Delivery resumes only the already-authorized next action; it never rewrites the task to
pending, resets a budget, discards changes, or treats restart as authority for another implementation.
Incomplete or contradictory recovery evidence stops for the owner. Dependencies still select fresh
pending work, so an externally blocked task may be deferred only while independent ready work remains.
This is conversational recovery evidence, not a database, scheduler, or persistent retry state, and
does not change independent review, integration gates, or delivery-only commit authority.

## Amendment (2026-10-29, recovery next-action and phase-gate ordering)

Recovery selects one evidenced next action rather than restarting the ordinary task sequence: pending
or failed validation precedes review; a current functional pass plus pending architecture gate dispatches
only architecture review; current required passes plus pending commit commit and accept without another
review. A known authorized task-owned revision change with consistent history invalidates touched verdicts
and receives validation plus fresh touched reviews; only unexplained or contradictory revision history
fails closed and is never labelled an external deferral. A declared pending phase integration gate is not
a general scheduling barrier: eligible recovered or dependency-ready task work continues. Before plan
completion, every pending declared gate is routed with its preserved count; its current pass is retained,
while `changes_required` or `blocked` follows the bounded approved route or stops and does not authorize
another integration review. This clarifies command ordering only; review independence, delivery-only
commit authority, conversational history, and all existing budgets remain unchanged.

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

- Issue #231.
- Skills: `base/opencode/skills/delivery-policy/SKILL.md`, `base/opencode/skills/plan/SKILL.md`.
- Agents: `delivery`, `reviewer`, `code`, `planner`, `troubleshooter`, `research`, `architect`.
- Commands: `/deliver`, `/deliver-plan`, `/load-plan`, `/implement-task`, `/review-task`.
