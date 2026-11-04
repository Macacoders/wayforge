---
status: blocked
created: 2026-10-31
task: 1/4
required_gates:
  architect_review: true
  memory_update: false
---

# Benchmark-backed harness evaluation implementation plan

**Goal:** Enable maintainers to evaluate the installed `base/opencode` Wayforge workflow against unmodified external benchmark tasks, with independently verified outcomes, auditable workflow/skill evidence, controlled comparisons, and explicit spending limits.

**Architecture:** Reuse an upstream benchmark runner, task environments, and verifiers rather than recreating them. A minimal adapter, only if needed, installs Wayforge from `base/opencode/**` into disposable benchmark workspaces, invokes the actual OpenCode entry point, and passes results back to the upstream runner. A small local evidence/report layer keeps official task scores separate from Wayforge workflow observations and human rubric judgements. The first task is a feasibility gate: if the runner cannot exercise and observe the real workflow, stop and seek an authorized change of approach instead of producing misleading scores.

**Tech Stack:** OpenCode CLI (pinned version; JSON run events or session export, subject to pilot verification); Wayforge TypeScript installer (`cli/src/**`); existing Node.js/TypeScript and Vitest for adapter/report tests; upstream SkillsBench/BenchFlow with `uv` and human-supervised Docker as the initial candidate. SWE-bench Verified is a later optional extension, not a dependency of this plan. No dashboard, database, scheduler, or new model-based judge.

**Scope classification:** multi-task (4 tasks). Separate tasks are warranted because compatibility with an upstream runner, repeatable execution, trustworthy evidence/budget reporting, and a human-supervised comparative run each have independent reviewable outcomes. The feasibility task is a stop/go gate for the remaining tasks.

**Risk:** full — external benchmark runtime/provider trust and budget boundaries, a new adapter interface, and multiple deliverables. Do not change Wayforge's delivery/review/permission rules in order to get a better benchmark score.

**Plan acceptance criteria:**
- A maintainer can run a pinned, explicitly authorized SkillsBench subset against a named Wayforge variant and obtain upstream verifier results without modifying upstream tasks or verifiers; evidence: adapter contract, upstream result, and human-supervised pilot log.
- At least one task in the pilot demonstrably exercises the intended Wayforge `delivery → code → reviewer` chain; if none can, report the evaluation as blocked and do not claim to measure the whole harness; evidence: actual run events with agent identities and revision, not prose from the agent.
- A report identifies benchmark/version/model/Wayforge revision, each attempt's outcome and observability, variant comparison, task/skill/workflow/efficiency measures where supported, and explicitly marks missing data and inconclusive results; evidence: representative report and parser tests.
- Paid runs require an explicit finite cost/token/time budget and maintainer authorization, cap per-attempt, per-variant, and per-run exposure to the degree enforced by the pinned provider/runtime, and never silently retry; evidence: budget/timeout tests and a disclosure of hard versus soft enforcement.
- Official verifier scores, Wayforge-only workflow checks, and human rubric assessments remain distinct. No upstream data, raw transcripts with possible secrets, generated `.opencode/` files, or paid benchmark runs enter regular CI or `make check`; evidence: diff and runner documentation.

**Constraints and decisions:**
- Initial benchmark choice: SkillsBench. Use upstream BenchFlow runner/task/verifier, pinned by revision. A stock OpenCode comparator is optional only if it receives a genuinely comparable entry point and task setup. Do not claim a small local subset is an official leaderboard score.
- Run experiments against installed output in disposable repos, never edit the generated `.opencode/` of this repository or benchmark verifier data. The `base/opencode/**` source remains unchanged by this evaluation plan.
- Scope any new local metrics to signals actually observed. Prefer OpenCode's existing event and session facilities and Wayforge's session-tracker for cross-checks before adding instrumentation. Validate the event format on the pinned version; do not count agent self-report as a skill load or independent review.
- Budget accounting includes all agents, repair rounds, grader calls if ever authorized, and failures. Pre-run estimates and between-attempt reservation prevent knowingly starting an attempt that exceeds the remaining budget; a genuine in-flight hard cap requires demonstrated provider/proxy/runtime support. Otherwise explicitly call it a soft cap and fail closed on missing usage data. A `budget_exhausted` or `timeout` attempt is neither a pass nor an ordinary verifier failure.
- Keep credentialed model calls, external benchmark downloads, Docker, and paid benchmark runs human-owned; agent-owned validations are local unit tests, typecheck, and static checks only. Never run benchmark experiments automatically during delivery.
- **Pilot trust boundary (must be proved before any run):** treat upstream task files and code as untrusted. Benchmark task processes must not receive raw provider credentials, host secret/config directories, or the Docker socket; no privileged containers or broad writable host mounts. Only the explicitly authorized OpenCode invocation may access a dedicated, spending-limited provider credential or appropriately scoped proxy, and it must not expose that credential to task-controlled processes or logs. If the chosen runner cannot demonstrate this separation, do not run the paid pilot: report a security no-go and ask the maintainer to approve a different isolation approach. A budget ceiling and human supervision alone do not substitute for isolation. The sole exception is the dedicated free-model key documented immediately below.
- **Maintainer-approved narrow exception, 2026-10-31:** For the first free-model Zen pilot only, the maintainer authorized a new dedicated key in the same task container as untrusted commands, acknowledging that those commands can read or use it. This exception applies only after Docker mount checks and with zero paid model use/no billing. It does not authorize a personal key, OpenCode Go key, host secret/config mounts, Docker socket, privileged container, or an agent-run benchmark. The original isolation rule remains for other credentials and paid pilots.
- Before the human-owned pilot, the maintainer authorizes the exact external benchmark checkout/workspace paths, sandbox/container access, credential recipient and dedicated provider spending ceiling. The repository boundary is not implicitly waived by this plan. No agent executes the pilot or authorizes a trust-boundary exception.

### Task 1: Establish benchmark compatibility and an honest measurement contract

**Status:** accepted — named role and skill evidence gate passed; broader evaluation remains blocked
**Depends on:** none

**Progress:** Earlier BenchFlow 0.6.3 ACP attempts showed incomplete or unidentifiable role evidence, and a local canary did not reach a child dispatch because free-model requests were rejected with `Free usage limit reached`. On 2026-11-01 the maintainer waived this Task 1 stop/go gate to allow offline Task 2 work. A 2026-11-02 supervised BenchFlow attempt captured `delivery`, `skill(name=delivery-policy)`, and a linked `code` child, but timed out at 900 seconds before any reviewer dispatch was recorded. The 2026-11-04 supervised probe then captured the full named chain in restricted session metadata: `delivery`, `skill(name=delivery-policy)`, and completed `task` dispatches linked to exported `code` and `reviewer` children. This passes Task 1's role/skill observability gate. Its verifier reward was `0.667`, BenchFlow ACP counters were unavailable, and no provider-billed cost or review-verdict/revision evidence was captured; those limits keep Tasks 2–4 blocked and prevent budget, efficiency, or verified-resolution claims.

**Objective:** Determine whether the documented SkillsBench runner can execute an installed Wayforge workflow and expose independent outcomes and necessary agent/skill events. Deliver a bounded integration specification and a reproducible, maintainer-owned pilot procedure; do not build a bespoke runner on speculation.

**Context:**
- `base/opencode/agents/delivery.md`, `base/opencode/skills/delivery-policy/SKILL.md`, `base/opencode/permissions/agents.yml` — authorized entry point, role separation, and acceptance gates.
- `cli/src/commands/install.ts` and `docs/ai/architecture.md` — installer and source/generated boundary; inspect exact install invocation before implementing.
- SkillsBench upstream README/tasks and BenchFlow runner documentation; OpenCode CLI `run --format json`/session export documentation — candidate integration interfaces, not verified compatibility.
- ADR-0048 — retain independent review and human-owned validation separation; compare against current source if historical prose differs.

**Acceptance criteria:**
- A versioned compatibility note names a pinned upstream benchmark revision, OpenCode version/interface, intended Wayforge entry point, chosen upstream task IDs, and how an upstream verifier receives final artifacts; evidence: cited upstream interface/docs and an example expected result shape.
- A human-supervised pilot either records a real benchmark attempt with upstream verifier output plus observable `delivery`, `code`, `reviewer`, and `skill(name)` events when applicable, or records the precise missing capability as a blocker; evidence: sanitized pilot trace and upstream result, or a reproducible incompatibility report. Never infer a missing role/skill from final text.
- The note defines what each proposed metric can and cannot establish, what is unobservable, the specific cost/safety exposure of the pilot, and a go/no-go recommendation. No subsequent paid experiment begins if the full workflow cannot be invoked and observed; evidence: compatibility note and bounded budget declaration.
- A human-readable preflight identifies task-controlled processes, mounts, Docker-socket exposure, network/credential recipients, and the exact authorized external paths; absent evidence that untrusted tasks cannot access host control or unrelated secrets, the pilot is blocked before execution. For the approved dedicated free-model key exception, record its exposure to task processes and the $0 paid-use control explicitly; evidence: isolation preflight and maintainer authorization (or security no-go).

**Constraints:**
- Do not change upstream tasks/verifiers, Wayforge prompts/policy, or provider settings to force a passing pilot. Do not commit benchmark workspaces, credentials, or raw sessions.
- No custom benchmark task/verifier; the only permitted local exploratory code is a minimal interface probe if required.

**Validations:**
- `human`: After confirming the isolation preflight and authorizing exact paths, credential recipient, and provider spending ceiling, run one pinned SkillsBench/BenchFlow task in a supervised sandbox — expected: upstream result and independently inspectable agent/skill events, or a documented no-go with no misleading success claim.

**Proposed commit message:** `docs: establish harness benchmark feasibility`

### Task 2: Deliver reproducible, budget-bounded upstream execution

**Status:** blocked — runner wiring and live validation remain
**Depends on:** Task 1

**Progress:** An offline budget contract now validates finite attempt, variant, run, and declared provider cost limits; reserves worst-case cost before each attempt; distinguishes timeout, runtime failure, verifier failure, and budget exhaustion; and stops subsequent attempts when usage is missing or does not cover child agents. A pinned evaluation manifest and preview command enumerate tasks, variants, repetitions, source revisions, and worst-case exposure; fake-runner tests verify no automatic retry and fail-closed usage handling. These pieces are not yet wired to a BenchFlow runner, and the declared provider ceiling is not proof of in-flight enforcement. On 2026-11-01 the maintainer deferred the live Task 2 validation because free-model requests are quota-limited and authorized offline Task 3 work to proceed. Task 2 remains unaccepted; live role evidence, paid-credential isolation, and the human-supervised smoke remain outstanding.

**Objective:** For a successful Task 1 go decision, deliver only the adapter/wrapper needed to run pinned upstream tasks against an installed Wayforge variant, with explicit authorization and finite budgets before any paid attempt.

**Context:**
- Task 1's verified benchmark runner API and pilot trace govern the integration; reuse them rather than building a replacement scheduler.
- `cli/src/index.ts`, `cli/src/commands/install.ts`, `cli/tests/unit/**`, root `package.json` — existing install and TypeScript/Vitest patterns.
- `base/opencode/permissions/agents.yml` — generated permissions must remain intact in benchmark workspaces.

**Acceptance criteria:**
- A documented maintainer command chooses a pinned benchmark/task subset, Wayforge revision/variant, model, finite repetitions, and explicit task/variant/run budgets; defaults are a smoke subset, one variant, one repetition, and no paid execution without confirmation; evidence: CLI help/docs and deterministic invocation tests.
- Each attempt receives an isolated workspace and installed Wayforge configuration, starts from the same task state for paired variants, invokes the real approved entry point, and returns the upstream runner's expected final artifact without altering upstream verifier inputs; evidence: adapter integration tests using a fake runner/workspace plus Task 1 pilot contract.
- Before each attempt the tool estimates/reserves its maximum permitted budget; all child-agent usage belongs to the attempt; an over-budget, failed, or timed-out attempt is marked separately and never retried automatically. Enforced versus soft in-flight caps are stated accurately and unknown usage prevents further attempts; evidence: tests for cap boundaries, missing usage, timeout, and no-retry behavior.
- Benchmark runs are human-triggered and do not execute as part of `npm test`, `make check`, or installer dry-run; credentials and traces are excluded from version control; evidence: diff and test/command wiring.

**Constraints:**
- Prefer an existing compatible OpenCode adapter upstream; keep any new interface narrow. Do not add unrelated plugins or change harness policy to satisfy the benchmark.
- Only a demonstrated provider/proxy/runtime limit may be called a hard spend cap; apply a provider account/project spending ceiling for the supervised experiment if the CLI cannot interrupt model calls mid-flight.

**Validations:**
- `agent`: `npx vitest run` — expected: targeted adapter and budget tests pass without contacting model providers or starting containers.
- `agent`: `npm run typecheck` — expected: passes for any TypeScript integration.
- `human`: Supervise a single, budget-limited upstream smoke attempt — expected: distinct upstream outcome and attempt-level usage/budget evidence.

**Proposed commit message:** `feat: run budgeted upstream harness evaluations`

### Task 3: Make outcome, skill, workflow, and cost evidence auditable

**Status:** blocked — report wiring and live validation remain
**Depends on:** Task 2

**Progress:** The maintainer authorized offline reporting work before Task 2's live adapter and validation are complete. The report layer now separates upstream verifier status from session-observed skill and child-agent events, keeps missing role names, billed cost, and reviewer decisions `unverifiable`, and emits per-attempt, per-task, variant, skill-label, and paired-difference measures. A checked-in synthetic input/output example demonstrates the format without claiming a live full-workflow measurement. The parser also classified the existing private `0.833` completed attempt as `verifier_failed` with workflow, full-session usage, and billing `unverifiable`. Twenty offline Python tests, root typecheck, and all 411 Vitest tests pass (the local-HTTP tests required running outside the filesystem sandbox). On 2026-11-01 the maintainer deferred live integration/validation and authorized offline Task 4 preparation. Task 3 remains unaccepted until real runner output and evidence coverage are checked.

**Objective:** Produce a reproducible per-attempt and paired-variant report without conflating benchmark pass/fail with Wayforge workflow compliance or qualitative judgement.

**Context:**
- Task 1 event contract and Task 2 runner results — sole supported data sources; `base/opencode/plugins/session-tracker/index.js` already summarizes per-agent tokens/cost and tool calls in memory, but is not a durable evaluation store.
- `base/opencode/skills/create-skill/SKILL.md` and SkillsBench/OpenCode skill-tool documentation — skill applicability versus actual `skill(name)` calls.
- `base/opencode/skills/delivery-policy/SKILL.md` and ADR-0048 — independent review revision, stop rules, and role boundaries.

**Acceptance criteria:**
- Report official per-task verifier status and verified resolution rate separately from observed skill loads, agent dispatches, review revision, permission/stop events, and cost/latency; missing or unsupported events are `unverifiable`, not passes; evidence: fixture-based parser tests and representative sanitized report.
- On a pre-labelled subset only, report relevant-skill load recall, unnecessary-load rate, and zero-load rate alongside outcome, with denominators and `not labelled` counts; do not treat loading a particular skill as mandatory for all successful benchmark tasks; evidence: labelled examples and metric tests including zero denominator.
- Report per-task and aggregate input/output/cache tokens where available, billed cost, elapsed time, tool calls, and cost per verified resolution with undefined cases clearly marked. Show paired pass-to-fail and fail-to-pass flips and per-task differences before averages; evidence: repeatable tests for missing usage, failures, and unequal run counts.
- Capture metadata (benchmark/task IDs and revision, Wayforge revision, OpenCode and model versions, variant, repetitions, budget enforcement type) and sanitized trace references. No raw secrets or unredacted transcripts are checked in; evidence: report examples and test fixtures.
- The report provides a separately labelled, fixed rubric for human assessment of ambiguous routing, handoff decision continuity, reviewer feedback quality, and justified safety stops; it does not assert an LLM judge is ground truth; evidence: rubric and a sample `not assessed` row.

**Constraints:**
- Do not build a dashboard, database, new benchmark verifier, or general-purpose observability platform. Avoid parsing free-form agent claims as authoritative runtime events.

**Validations:**
- `agent`: `npx vitest run` — expected: deterministic metric and report tests pass offline.
- `agent`: `npm run typecheck` — expected: passes for any TypeScript changes.

**Proposed commit message:** `feat: report harness outcomes and behaviour separately`

### Task 4: Demonstrate a controlled, human-supervised comparison

**Status:** blocked — offline comparison prepared; live run deferred
**Depends on:** Task 3

**Progress:** The maintainer authorized preparing a controlled comparison before Task 3's live validation is complete. The offline preparer created ignored baseline and `without_delivery_policy` workspaces from pinned Wayforge and SkillsBench revisions, with the same Big Pickle model for root/helper/all explicit agents, one `dialogue-parser` repetition, and a declared one-attempt-per-variant $0 paid-use budget. File hashes verify that the only between-variant change is removal of `.opencode/skills/delivery-policy/SKILL.md`. The preparation manifest and a short deferred-comparison report both say `not_run`; no model, Docker, benchmark, or verifier invocation was made. The variant's runtime effect, live comparison, and model/provider controls remain unvalidated.

**Objective:** Prove the evaluator is useful by capturing a baseline and one narrowly defined skill or rule ablation on the same pinned subset, without editing the reusable harness as part of the evaluation itself.

**Context:**
- Tasks 1–3 define the feasible runner, budgets, metrics, and report; upstream SkillsBench verifiers remain the independent outcome oracle.
- `base/opencode/**` is the source of truth for both variants; variants are ephemeral evaluation copies, not source or generated output edits.

**Acceptance criteria:**
- A maintainer-owned, budgeted run (or an explicitly documented inability to afford/authorize it) records the baseline and one single-change variant with identical benchmark revision, task IDs, model, OpenCode version, and attempt budgets; evidence: run manifests and upstream reports. Expanding to repeated runs is human-authorized within the declared budget, not an automatic requirement when cost would be excessive.
- The comparison states which tasks changed verifier outcome, the direction of per-task and aggregate usage changes, skill/workflow observation differences, and any missing or ambiguous evidence. It labels exploratory one-run findings inconclusive and does not attribute causality to a rule without supporting paired traces/repetitions; evidence: sanitized comparison report.
- Any proposed change to Wayforge policy, prompts, skills, or role authority is a separately authorized follow-up, not an automatic outcome of a better score; evidence: diff and comparison conclusions.

**Constraints:**
- Do not publish a leaderboard claim or expose benchmark prompts, user credentials, or raw provider sessions as tracked project memory. Keep the execution external and human-supervised.

**Validations:**
- `human`: Authorize and supervise the pinned paid benchmark comparison with a declared maximum spend — expected: upstream task results and a report distinguishing results, observations, and inconclusive judgements; if not authorized, plan acceptance remains outstanding, not silently waived.

**Proposed commit message:** `docs: record controlled harness benchmark comparison`

## Handoff for the next agent (2026-11-01)

**Read first:** this plan, `docs/ai/reports/skillsbench-compatibility-2026-10-31.md`,
`docs/ai/reports/skillsbench-comparison-deferred-2026-11-01.md`, and
`scripts/benchmark/README.md`. Task 1 was accepted by maintainer **waiver**, not by
proof of the `delivery → code → reviewer` chain. Tasks 2–4 are **not accepted**.
The current free-model key returns `Free usage limit reached` for MiMo and Big
Pickle. Do not run a canary or benchmark merely to reproduce that error.

### Coding work that remains

1. **Task 2 runner integration:** Connect `evaluation_plan.py`'s validated
   `EvaluationPlan`/`AttemptSpec` and `budget_contract.py`'s `BudgetLedger` to
   the pinned BenchFlow 0.6.3 rollout used in `run_skillsbench_probe.py`.
   The probe is currently one hard-coded MiMo, `dialogue-parser` attempt, not
   a budgeted multi-task runner. Parameterize only the needed task/model and
   variant inputs, create a fresh disposable installed workspace per attempt,
   preserve upstream task/verifier files, and return a machine-readable
   result without scraping human preflight text. Reserve before each attempt;
   stop on missing all-agent usage; never retry silently. Keep execution
   human-triggered, with the probe's mount review and credential checks.
   Prove the wrapper with a fake BenchFlow runner/workspace before any live
   invocation. The offline `evaluation.example.json` is a preview, not an
   executable run manifest.
2. **Task 3 result integration:** Convert each real upstream `result.json` and
   the allowlisted `*.evidence.json` session summaries from `capture_sessions`
   into the input schema of `report.py::build_report` (see
   `report.example.input.json`). `report.py` must never ingest raw session
   transcripts or agent prose. An incomplete capture, missing child link, or
   BenchFlow ACP usage that may omit children must remain `unverifiable`.
   Provider billed cost is optional and requires a private source reference;
   session cost is only a runtime estimate. Test the conversion with fake
   runner fixtures and the saved private `0.833` result, which is a completed
   **verifier failure**, not verified resolution.
3. **Task 4 execution handoff:** The ignored
   `temp/benchmark-testing/comparison-gx6up_7z/comparison-manifest.json`
   records two prepared workspaces and their hashes. The sole between-variant
   file difference is absence of
   `.opencode/skills/delivery-policy/SKILL.md` in the ablation. Before any
   paired run, confirm this is still the desired single-change variant and
   that both copies have identical task state, OpenCode version, model, and
   budgets. No comparison outcome exists yet.

### Validation and authorization boundaries

- Offline checks: `python3 -m unittest discover -s scripts/benchmark -p 'test_*.py'`,
  `python3 scripts/benchmark/evaluation_plan.py scripts/benchmark/evaluation.example.json`,
  `python3 scripts/benchmark/report.py scripts/benchmark/report.example.input.json`,
  `npm run typecheck`, and `npx vitest run`. The last full run passed 411 tests
  outside the sandbox; local-HTTP tests fail with `listen EPERM` inside it.
- A future model or Docker run is **human-owned** and needs usable model
  access, exact path/credential recipient authorization, fresh mount and
  secret-boundary inspection, current pricing, and a finite provider ceiling.
  The old exception was limited to the first dedicated free-model pilot; it
  did not authorize paid credentials or new benchmark attempts. Local
  reservation is a soft between-attempt cap, not provider-side enforcement.
- Do not mark the full harness measured until runtime evidence identifies
  named `code` and `reviewer` child sessions and `skill(name)` calls. Keep
  upstream verifier scores, workflow observations, provider billing, and
  human rubric judgements separate. Task 3's synthetic report example is
  labelled `data_origin: synthetic` and is not a benchmark finding.
- The benchmark scripts, plan, and reports are currently **untracked** in
  this workspace, alongside unrelated user edits under `base/opencode/**`
  and `cli/**`. Inspect `git status` before continuing; preserve those edits
  and stage only owned files when the relevant task is ready for review.
