---
status: in-progress
created: 2026-11-04
task: 1/4
required_gates:
  architect_review: true
  memory_update: true
---

# Complete benchmark evaluation program implementation plan

**Goal:** Turn the existing supervised SkillsBench probe, offline budget contract, and synthetic report into a repeatable, human-authorized evaluation workflow that reports upstream outcomes, observed workflow evidence, usage uncertainty, paired comparison results, and separately assessed review quality.

**Architecture:** Keep BenchFlow 0.6.3 and the unmodified SkillsBench verifier as the execution/outcome authority. Extract the probe's reusable staging, isolation, capture, and redaction path into a narrow runner adapter driven by `EvaluationPlan` and `BudgetLedger`; it creates an ignored fresh workspace for each declared attempt and writes only restricted machine-readable artifacts. A conversion layer builds `report.py`'s existing input schema from those artifacts, while a separate human rubric sidecar records reviewer-decision evidence without parsing agent prose as authoritative data.

**Tech Stack:** Python 3 stdlib (`argparse`, `asyncio`, `dataclasses`, `json`, `unittest`), pinned BenchFlow 0.6.3 / SkillsBench revision / OpenCode 1.18.35, existing `evaluation_plan.py`, `budget_contract.py`, `report.py`, and probe capture helpers.

**Scope classification:** multi-task

**Risk:** full — this adds a human-triggered external runner, uses a credential in a task-controlled container under the existing narrow exception, creates a machine-readable private artifact interface, and drives an exploratory controlled comparison. No task may run a model, Docker, or BenchFlow command without the separately authorized human validation below.

**Plan acceptance criteria:**
- A human-triggered runner accepts a strict pinned evaluation manifest, creates a fresh disposable workspace for every attempt, preserves upstream tasks/verifiers, reserves every attempt before execution, emits restricted machine-readable attempt records, and stops rather than retrying or continuing after unknown all-agent usage.
- A report generated from real attempt records separates verifier outcome, named runtime role/skill observations, measured session-export usage, partial/unavailable BenchFlow usage, and unknown provider billing; it never consumes raw exports or agent prose and never substitutes missing data with zero.
- One maintainer-authorized baseline/skill-unavailable pair runs against the same pinned task, model, revision inputs, and declared limits, with paired outcomes and uncertainty recorded as exploratory only.
- Reviewer decision/revision evidence and workflow-quality assessment are recorded only in a separately labelled human rubric sidecar with provenance; unavailable evidence remains `unverifiable`.
- Offline unit tests prove adapter, conversion, comparison, and rubric boundaries; benchmark execution remains outside CI, `npm test`, and `make check`.

## Phase 1: Reproducible attempt and evidence pipeline

**Integration acceptance criteria:** A fake BenchFlow adapter can drive the same attempt lifecycle as the real adapter, producing an attempt record consumable by the report converter without exposing a key, raw session export, or transcript.

### Task 1: Deliver a bounded, fresh-workspace BenchFlow evaluation runner

**Status:** accepted
**Depends on:** none

**Objective:** Replace the one hard-coded probe execution path with a human-triggered runner that executes the `EvaluationPlan` schedule through the pinned BenchFlow adapter and `BudgetLedger`, while retaining the probe's container/key safeguards and restricted session capture.

**Context:**
- `scripts/benchmark/evaluation_plan.py` — validates pinned benchmark/model/task/variant/repetition selections and exposes ordered `AttemptSpec` values plus `run_with_runner`; it currently accepts only an injected fake runner.
- `scripts/benchmark/budget_contract.py` — reserves before an attempt and blocks all following attempts after incomplete all-agent usage, a limit overrun, or an attempt cap.
- `scripts/benchmark/run_skillsbench_probe.py` — contains the known BenchFlow 0.6.3 registry override, exact-container preflight, key handling, OpenCode version check, restricted export summarizer, child-session traversal, and source-labelled usage extraction. Reuse/refactor these safeguards; do not duplicate or weaken them.
- `scripts/benchmark/prepare_skillsbench_probe.py` and `scripts/benchmark/prepare_comparison.py` — establish tracked-source installation, a pinned SkillsBench checkout, and the existing single-file skill-unavailable variant contract. They currently create reusable preparation workspaces, not a fresh copy per scheduled attempt.

**Acceptance criteria:**
- A strict private run manifest binds an `EvaluationPlan` to a pinned clean SkillsBench checkout and declared variant source workspaces/digests; unsafe paths, revision mismatches, missing installed delivery/code/reviewer files, non-free configuration for a $0 run, and task/model disagreement fail before reading the key or starting Docker.
- For every scheduled `AttemptSpec`, the runner makes a new ignored workspace from the declared immutable variant source, verifies its digest and required installed files, uses the manifest's task/model/timeout values, and leaves upstream task/verifier inputs unchanged.
- The runner reserves with `BudgetLedger` before invoking BenchFlow; maps upstream completion, verifier failure, timeout, runtime failure, and budget overrun to its existing outcome vocabulary; records the attempt once; never silently retries; and stops before the next scheduled attempt when capture/usage is incomplete or a limit is exceeded.
- Each completed invocation writes a restricted machine-readable attempt record containing attempt metadata, the allowlisted upstream result fields, `benchflow_usage()`, capture status/index location, and ledger outcome. It must not write the key, raw exports, or agent prose, and all output remains beneath ignored `temp/benchmark-testing`.
- The runner retains the interactive exact-container mount/capability/environment-name review and 0600 dedicated-key requirement before each model attempt. It may not be wired into default tests or CI.

**Constraints:**
- Preserve the pinned BenchFlow 0.6.3 ACP launch correction and existing 50-session capture limit; if capture is truncated or evidence is incomplete, report it as incomplete rather than estimating usage.
- Do not implement a scheduler, persistence service, provider billing scraper, or automatic paid/free fallback. The provider ceiling remains a human-confirmed control, not a claimed in-flight cap.
- Keep the current one-attempt probe available as a diagnostic interface check until the new runner has equivalent fake-adapter coverage.

**Validations:**
- `agent`: `python3 -m unittest discover -s scripts/benchmark -p 'test_*.py'` — fake adapter/workspace tests prove fresh-copy, pin/digest rejection, pre-reservation, outcome mapping, no-retry, and fail-closed capture behavior without importing BenchFlow at module load or starting Docker.
- `agent`: `python3 scripts/benchmark/evaluation_plan.py scripts/benchmark/evaluation.example.json` — the offline manifest preview remains valid.
- `human`: with a renewed exact authorization, $0 provider ceiling, current free-model/pricing check, and approved paths, run one scheduled smoke attempt using the pinned BenchFlow interpreter — expected: mount preflight is accepted by the maintainer and one restricted attempt record plus session index are created; no claim of task success follows automatically.

#### Task 1 validation and handoff evidence

- Offline validation rerun during handoff review: `python3 -m unittest discover -s scripts/benchmark -p 'test_*.py'` — 57 tests passed; `python3 scripts/benchmark/evaluation_plan.py scripts/benchmark/evaluation.example.json` — valid offline preview. No Docker/model invocation was performed during this review.
- Human smoke evidence (reported in the handoff; private artifacts not copied into memory): `temp/benchmark-testing/attempt-1-baseline-dialogue-parser-3wfc4vea/attempt.json`. Capture was `captured`, with delivery, two code sessions, and reviewer; all session usage was measured. Verifier reward was 0.667, with no runtime error. Input usage was 124076 against a 100000 limit; output usage was 23747 against a 20000 limit. Ledger outcome was correctly `budget_exhausted`. Estimated session cost was 0; this is not evidence of provider-billed cost.
- Smoke assessment: sufficient evidence for the human validation's runner/capture path and a correct between-attempt budget stop, not task success or overall Task 1 acceptance. The limits are soft between attempts; their overrun does not itself require another smoke. Do not retry or raise limits automatically.
- Initial working-tree inspection verdict: **changes required**, not an independent architecture/functional approval. No separate reviewer tool was available in the handoff session. Task 1 remains unaccepted/uncommitted; Task 2 remains dependency-blocked.
- Initial blocking findings in `scripts/benchmark/evaluation_runner.py` (repair evidence follows; not independent review verdicts):
  - `run_live`: the key-path guard rejects keys outside the evaluation root despite its error message requiring that location, and permits keys inside it. Correct the guard and add both-path regression tests without reading a real key.
  - `_assert_run_config`: root/small-model checks omit child-agent overrides. An offline fixture with a paid `code` model was accepted. Validate all effective role/helper model pins against the manifest before credential access; do not weaken the probe's free-model safeguards.
  - `run_live` / `_fresh_workspace` / `_benchflow_attempt`: source digest, required installed files, config, and task checks occur after `private_key`; validate every declared input before key access. Recheck the copied workspace digest, not only the source, before execution.
  - `_benchflow_attempt`: registry patching assumes the original `opencode-ai@latest` install command on every invocation although it registers the replacement globally. Prove repeated attempts work with a fake pinned registry and make the patch safe across attempts.
  - `execute`: persisted attempt metadata omits benchmark SHA, OpenCode version, model, declared limits, and numerical ledger usage. Preserve sufficient pinned provenance and budget evidence for the next task without embedding raw artifacts.
  - `test_evaluation_runner.py`: the six runner tests do not exercise the real adapter with fake BenchFlow interfaces, revision/config rejection before key access, repeated registry use, timeout/outcome mapping, or measured-budget overrun. The passing aggregate suite does not establish those Task 1 gates.
- Bounded repair completed locally in `scripts/benchmark/evaluation_runner.py` and `scripts/benchmark/test_evaluation_runner.py`:
  - Corrected the key-path guard; all source/config/task/revision checks now precede initial credential access. Key ownership/permissions and unchanged key contents are checked again before each attempt.
  - Enforced manifest-model agreement for JSON role/helper overrides and explicit markdown agent model fields; checked the copied workspace digest; rejected using the evaluation root itself as a source (which could cause recursive copying).
  - Made the pinned registry correction repeat-safe and mapped outer timeout exceptions to `timeout`, including Python versions where `asyncio.TimeoutError` differs from builtin `TimeoutError`.
  - Added restricted attempt pins, declared limits, measured numerical usage, and separate upstream/ledger outcomes. Estimated session cost remains explicitly distinct from provider billing.
  - Added offline fake-SDK adapter lifecycle coverage for staging, preflight, cleanup/capture, repeated registry use, completion/verifier/runtime/timeout outcomes, measured capture, missing children, truncation, and credential-leak aborts. Additional tests cover pre-key rejection, pre-reservation, copied-digest tampering, independent fresh copies, overrun stops, and exception no-retry behavior.
- Post-repair validation: `python3 -m unittest discover -s scripts/benchmark -p 'test_*.py'` — **68 tests passed**; offline evaluation example preview passed. Whitespace checks against both untracked Python files produced no findings. No live run was performed and no private artifacts were read or copied.
- The additional human-reported smoke output confirms 12 tool calls and timings of 2.6s environment setup, 20.7s agent setup, 900.5s agent execution, 5.1s verifier, and 981.8s total. It does not change the budget-exhausted interpretation or establish an in-flight hard cap.
- Next gate: fresh **independent architecture and functional review** of the repaired working-tree files, then commit only on passing gates. Independent review is still unavailable in this session; the implementer's offline checks are not its substitute. Task 1 stays in-progress/uncommitted and Task 2 remains dependency-blocked. Any new live validation requires renewed human authorization, mount inspection, current pricing, a provider ceiling, and revised finite limits. No new live run is authorized by this note.

- Follow-on repair implementation: `docs/ai/plans/2026-11-04_204359-repair-benchmark-task-1.md`
  records the offline single-model preparation path, conservative markdown
  preflight, explicit session-cap incompleteness, and retained failure/cleanup
  evidence. **86 offline tests passed**, including preparation through the actual
  adapter with fake SDK interfaces. No private inputs or credentials were read
  and no new live run occurred. Independent architecture/functional review is
  still unavailable; neither repair tasks nor parent Task 1 are accepted or
  committed. Parent Task 2 remains dependency-blocked. Historical human smoke
  evidence above is unchanged and is not independent approval.

- Latest human-reported smoke after the authorized one-hour limit change:
  agent execution 2,192.3s, total 2,277.9s; verifier reward 0.833 with no runtime
  or timeout error. Delivery loaded delivery-policy, and code/reviewer dispatches
  completed. Capture/index and cleanup succeeded; measured complete usage was
  113,194 input / 24,429 output tokens, exceeding the unchanged 100,000 / 20,000
  limits. The runner correctly retained `upstream_outcome: verifier_failed`
  separately from `ledger_outcome: budget_exhausted`. Estimated session cost was
  zero, not proof of provider billing. This supplies human runner-path evidence;
  no additional live run is required for repair acceptance. Independent review
  remains the blocking gate; Task 1 is not accepted/committed and Task 2 remains
  dependency-blocked.

### Task 1 acceptance

- Repair-plan functional/integration review (`repair-final-functional`) and
  architecture review (`repair-final-architecture`) both passed the exact
  working tree based on `899bc1c`, scope fingerprint
  `cf5cc7209dc56847d71d4fa202a545be15d83863142ac7462239c4e38a8abbc9`.
  The reviews found no actionable findings; they covered every Task 1 criterion,
  model/pre-key policy, source preservation, capture/evidence boundaries,
  cleanup ownership, secret handling, and ADR-0008 compatibility.
- Agent-owned offline validation on the reviewed revision passed: 92 benchmark
  tests, preparation CLI help, evaluation-example preview, Python compilation,
  and whitespace checks. No live benchmark, Docker, credential, private
  manifest/workspace, session, or provider artifact was accessed.
- Task 1 is accepted and committed in the scoped repair delivery. Historical
  human smoke observations remain runner-path evidence only; they do not alter
  Task 2's separate acceptance and human-validation requirements.

### Task 2: Convert restricted attempts into live reports

**Status:** pending
**Depends on:** Task 1

**Objective:** Make the runner's private attempt records directly renderable by `report.py`, producing a live report bundle without manual reconstruction and preserving every existing unknown-data rule.

**Context:**
- `scripts/benchmark/report.py` — already normalizes probe index sessions, keeps source-labelled usage/per-agent totals, reports incomplete children as `unverifiable`, and separates official outcome from workflow observations. It currently requires a hand-authored bundle and initializes review fields/rubric as unavailable.
- `scripts/benchmark/report.example.input.json` and `report.example.output.json` — synthetic schema examples; they must remain explicitly synthetic and must not be replaced with private run data.
- `scripts/benchmark/run_skillsbench_probe.py::capture_sessions` — emits the restricted `session-export-index.json` shape, while its private `*.evidence.json` files are allowlisted summaries only.
- `scripts/benchmark/test_report.py` — covers normal report shape, missing child usage, source disagreement, and absent BenchFlow usage; reuse its fixtures for live-record conversion tests.

**Acceptance criteria:**
- A conversion command/function reads only runner attempt records, their allowlisted `result.json` fields, and `session-export-index.json` records to produce `report.py::build_report` input with `data_origin: "live"`; it rejects absolute/traversal references, raw exports/transcripts, missing required pins, and mismatched task/variant/repetition metadata.
- The converted report represents the root-and-child session index from a real/saved probe as measured only when every session and child dispatch is complete; missing sessions, unparsed tools, partial usage, or unavailable sources remain `unverifiable`/`unavailable` exactly as in the current report contract.
- BenchFlow ACP counters remain a separate source and provider-billed cost remains unavailable unless a human supplies a private billing reference; neither is inferred from session cost, zero counters, or free-model configuration.
- The generated private report includes declared budget enforcement and ledger outcomes alongside existing official/workflow/usage fields, so a timeout, verifier failure, runtime failure, and budget exhaustion remain distinguishable.
- The command never reads or writes checked-in synthetic examples, raw session exports, credentials, or task transcripts.

**Constraints:**
- Reuse `build_report`, `attempt_report`, `benchflow_usage`, and index normalization rather than creating a second report schema or metric implementation.
- Do not parse free-form agent output to fill role, skill, verdict, or revision fields. A missing structured runtime field stays unavailable.

**Validations:**
- `agent`: `python3 -m unittest discover -s scripts/benchmark -p 'test_*.py'` — fixtures cover a complete three-role live record, absent/partial capture, BenchFlow undercount, metadata mismatch, and provider-billing absence.
- `agent`: `python3 scripts/benchmark/report.py scripts/benchmark/report.example.input.json` — the synthetic example still renders byte-identically to its checked-in output.
- `human`: render a report from the Task 1 smoke record — expected: it includes the observed role chain and combined usage when capture is complete, and it labels unavailable BenchFlow/provider values without a zero-spend claim.

## Phase 2: Controlled exploratory comparison and quality assessment

**Integration acceptance criteria:** The same runner and report path produce both members of a one-task paired comparison and a clearly separate human assessment, with no automatic continuation when safety/budget evidence is incomplete.

### Task 3: Run the prepared controlled baseline and skill-unavailable comparison

**Status:** pending
**Depends on:** Task 2

**Objective:** Execute and report one maintainer-approved exploratory baseline/`without_delivery_policy` pair using the existing single-file ablation contract and identical pinned execution inputs.

**Context:**
- `scripts/benchmark/prepare_comparison.py` — prepares ignored baseline and ablation source workspaces, pins every configured role and helper to Big Pickle, records full revisions/digests, and proves the only file difference is removal of `.opencode/skills/delivery-policy/SKILL.md`.
- `scripts/benchmark/evaluation_plan.py` — produces equivalent task/repetition schedules for every variant and checks run/variant worst-case limits.
- `scripts/benchmark/report.py::paired_comparison` — already exposes per-task paired status direction and usage deltas, marks unpaired or incomplete data explicitly, and labels results exploratory.

**Acceptance criteria:**
- The comparison manifest feeds the Task 1 runner through an evaluation manifest with exactly `baseline` and `without_delivery_policy`, the same pinned SkillsBench revision, task ID, OpenCode version, model, repetition count, and finite per-attempt/per-variant/run limits.
- Before each run, the runner verifies the recorded workspace digests and the sole ablation difference; a changed/missing source workspace, different model, or unpaired schedule stops the comparison before a model call.
- The maintainer-owned execution records each attempt's upstream verifier result, runtime role/skill observations, session/BenchFlow usage sources, and budget outcome. A missing/partial first attempt stops subsequent attempts under the ledger; it is reported as incomplete rather than retried to manufacture a pair.
- The report presents both individual attempts and their pair, including pass-to-fail/fail-to-pass/unchanged/inconclusive direction, usage deltas only when both operands are measured, and an explicit one-pair exploratory/no-causality interpretation.

**Constraints:**
- Preserve the upstream task and verifier unchanged. Do not compare different task state, provider/model, timeout, OpenCode version, or source revision under the same pair.
- Do not expand to repetitions, more tasks, paid models, or another ablation without a new human authorization and manifest/limit review.

**Validations:**
- `agent`: `python3 -m unittest discover -s scripts/benchmark -p 'test_*.py'` — comparison-manifest and runner tests reject unintended workspace differences and unpaired inputs.
- `agent`: `python3 scripts/benchmark/prepare_comparison.py` — offline preparation continues to prove the one-file difference and does not invoke BenchFlow/Docker/models.
- `human`: after a fresh isolation preflight and explicit budget authorization, run the single baseline/ablation pair — expected: two comparable restricted records and a live paired report, or an explicit stop/incomplete result with no retry.

### Task 4: Record reviewer decision evidence and assess workflow quality separately

**Status:** pending
**Depends on:** Task 2

**Objective:** Add a private, human-owned assessment sidecar that records provenance-backed reviewer verdict/revision evidence and applies the report's existing workflow-quality rubric without conflating it with upstream task success or runtime observation.

**Context:**
- `scripts/benchmark/report.py` initializes `review_verdict`, `reviewed_revision`, and the `RUBRIC` fields (`ambiguous_routing`, `handoff_decision_continuity`, `reviewer_feedback_quality`, `justified_safety_stops`) as unavailable/not assessed because the current restricted session metadata has no structured review-result schema.
- `base/opencode/skills/delivery-policy/SKILL.md` defines a functional review as a revision-specific `pass | changes_required | blocked` verdict with per-criterion evidence; it prohibits delivery self-verification.
- `docs/ai/plans/2026-10-31_224912-benchmark-backed-harness-evaluation.md` requires human assessment to remain distinct from official verifier outcomes and warns against parsing free-form agent claims as authoritative runtime events.

**Acceptance criteria:**
- A strict private sidecar schema permits a human assessor to record an attempt identity, a reviewer verdict/reviewed revision when supported by an approved sanitized evidence reference, one value for each existing rubric dimension, and concise evidence references; unsupported fields remain `unverifiable`/`not assessed`.
- Report ingestion validates that sidecar attempt identity matches the live attempt, permits only policy-valid verdict values and safe relative evidence references, and renders human evidence in a separately labelled section without changing `official`, runtime `workflow`, or usage metrics.
- The report never derives a verdict, revision, or rubric score from raw/unsanitized session content or agent prose. A reviewer child session alone proves dispatch identity, not review quality or acceptance.
- Documentation defines the assessor procedure, available choices, provenance requirement, and the rule that incomplete/ambiguous evidence is not assessed rather than guessed.

**Constraints:**
- This is a human rubric, not an LLM judge, automated quality score, new reviewer authority, or replacement for the delivery-policy acceptance loop.
- Keep sidecars and referenced sanitized evidence private/ignored; do not commit benchmark prompts, agent prose, credentials, provider billing extracts, or raw sessions.

**Validations:**
- `agent`: `python3 -m unittest discover -s scripts/benchmark -p 'test_*.py'` — tests accept valid matching sidecars and reject invalid verdicts, unsafe references, mismatched attempt identities, and attempts to overwrite official/runtime evidence.
- `agent`: `python3 scripts/benchmark/report.py scripts/benchmark/report.example.input.json` — synthetic reporting retains explicit `not assessed` rubric fields when no sidecar is supplied.
- `human`: complete one assessment against a restricted report artifact — expected: verdict/revision and rubric findings are traceable to the cited sanitized evidence, or remain unavailable/not assessed.

## Plan completion

After all four tasks are accepted, update `scripts/benchmark/README.md`, `docs/ai/reports/skillsbench-compatibility-2026-10-31.md`, and the benchmark evaluation plan's progress fields to distinguish completed runner/report capabilities from any unrun or human-owned comparison. Record the outcome and remaining limits in `docs/ai/logs/`. Do not mark a one-pair comparison as a benchmark conclusion or full workflow-quality proof.
