---
status: completed
created: 2026-11-04
task: 3/3
required_gates:
  architect_review: true
  memory_update: true
---

# Repair benchmark runner Task 1

**Goal:** Resolve the prepared-workspace model mismatch and remaining review findings so the parent runner task can undergo independent acceptance review without requiring another live benchmark.

**Parent plan:** `docs/ai/plans/2026-11-04_113736-complete-benchmark-evaluation-program.md`, Task 1. Task IDs below belong only to this repair plan; they do not replace or renumber the parent's tasks. Parent Task 2 remains blocked until parent Task 1 is accepted.

**Architecture:** Preserve strict manifest-model agreement rather than permitting heterogeneous free models. A credential-free preparation command creates normalized, fresh private source copies and a new manifest with recomputed digests; execution remains read-only toward declared source workspaces. Reuse the existing capture helper and ledger, but make capture completeness explicit and retain restricted evidence across adapter failures.

**Tech Stack:** Python stdlib, existing pinned BenchFlow 0.6.3 adapter, unittest fake environments/SDK interfaces. No new runtime service or YAML dependency.

**Scope classification:** multi-task — three separately reviewable deliverables: preparation/model consistency, bounded-capture completeness, and failure-path evidence with final integration.

**Risk:** full — model/spending policy, credential boundaries, and private evidence contracts. Planning does not authorize execution or private-file modification.

## Grounded findings

- The human's latest invocation failed in `validate_inputs` on `research` model agreement, before initial credential access or Docker. Its actual private config value has not been inspected.
- `base/opencode/config/agents/free-tier-agent-block.jsonc` intentionally contains different free models by role, including research. `prepare_skillsbench_probe.pin_free_models` changes only root/small-model fields; its tests explicitly preserve per-agent model differences. This is compatible with the diagnostic probe but not the evaluation runner's single-model contract.
- `prepare_comparison.pin_shared_model` already normalizes explicit JSON agent models, but is hard-coded to Big Pickle and exposed only through paired-comparison preparation. Reuse its mechanism rather than introducing a second pinning algorithm.
- `_assert_run_config` checks markdown model fields using `line.startswith('model:')`. A valid quoted YAML key (`'model': openai/paid-model`) bypassed this check in an offline fixture.
- `capture_sessions` requests at most 50 listed sessions and processes at most 50 unique IDs. An offline reproduction supplied 51 listed sessions; it exported 50 and returned `captured`, and `complete_session_usage` accepted the subset as complete. At exactly the listing cap, absence of additional sessions is also unproven.
- `execute` converts runner exceptions into outcomes with empty evidence. `_benchflow_attempt` assembles evidence only after `rollout.run` returns, so a failure can discard capture metadata produced during cleanup.
- Existing baseline: 68 offline tests passed after the previous repair. Those tests do not establish the missing boundaries above.

## Plan acceptance criteria

- A mixed-model installed fixture can be prepared offline into immutable single-model evaluation source workspaces whose new manifest passes the runner's validation; original files, original manifest, and historical attempts remain unchanged.
- Unsupported markdown model overrides cannot bypass the single-model/free-model preflight or cause a credential read.
- Capture at an ambiguous/exceeded session cap or with unresolved sessions is explicitly incomplete; no subsequent attempt runs and no unknown usage becomes zero.
- Runtime/timeout failures retain available restricted capture evidence and remain distinct from verifier and budget outcomes; secret detection remains a fatal abort.
- Independent architecture and functional reviews inspect the exact final revision and pass the parent Task 1 criteria before parent acceptance/commit. Self-review and successful live smoke are not substitutes.

### Task 1: Prepare evaluation-compatible source workspaces without weakening preflight

**Status:** accepted
**Depends on:** none

**Objective:** Provide a bounded offline path from a valid pinned private run manifest with mixed-model source configs to fresh single-model source copies and a new digest-bound manifest, and close markdown model-validation bypasses.

**Context:**
- `scripts/benchmark/prepare_comparison.py::pin_shared_model`, `file_hashes`, `workspace_digest` — existing model-normalization and hashing mechanisms.
- `scripts/benchmark/prepare_skillsbench_probe.py::pin_free_models` and `test_prepare_skillsbench_probe.py` — diagnostic probe intentionally preserves role models; do not change that compatibility contract silently.
- `scripts/benchmark/evaluation_runner.py::EvaluationManifest`, `validate_inputs`, `_assert_run_config` — strict execution contract and pre-key checks.
- `scripts/benchmark/test_prepare_comparison.py`, `test_evaluation_runner.py` — reusable fixtures and patched evaluation-root pattern.
- `docs/ai/decisions/ADR-0008-modular-opencode-provider-installs.md` — generated agent files are model-agnostic; config centralizes model selection.

**Acceptance criteria:**
- A narrow `scripts/benchmark/prepare_evaluation.py` CLI accepts an existing private evaluation-run manifest and emits fresh normalized workspace copies plus a new private manifest beneath ignored `temp/benchmark-testing`. It never imports BenchFlow, reads credentials, invokes the installer, or starts Docker/models.
- Preparation first verifies structural safety, benchmark/task pins, existing source digests, required installed files, and source symlink restrictions. It may repair declared JSON model assignments, not conceal stale digests, missing files, changed revisions, or unsafe sources. Malformed/non-free manifest model selections fail.
- Root model, small model, and every explicit JSON role/helper model in the copies equal the manifest model, including research and roles absent from the delivery/code/reviewer fixture. Model-less agents inherit the pinned root. Invalid agent config shapes fail rather than being silently skipped.
- Preparation reuses a parameterized existing model-pinning mechanism. `prepare_comparison` retains its Big Pickle default and one-file ablation invariant; the diagnostic probe retains its documented mixed-free-model behavior. Do not alter reusable installer/provider defaults to fix an evaluation-only issue.
- Markdown agents remain model-agnostic: unsupported frontmatter is rejected rather than rewritten or interpreted by ad hoc scalar parsing. Use a conservative allowlisted generated-frontmatter subset; alternate key encodings, explicit model fields, aliases/merge keys, or other constructs whose model semantics cannot be established must fail closed. A quoted model key and ordinary explicit model key are both rejected before key access. This deliberately narrows evaluation input support, not OpenCode's general YAML support.
- New workspace digests are calculated only after normalization, agree with the runner's digest function, and are written into the new manifest. All non-model source content and variant/task/repetition/pin/limit selections remain unchanged; no cap or price authorization is inferred or increased.
- Inputs and existing attempts are never overwritten. The command prints only the resulting private manifest location and restricted preparation metadata. Documentation explains the exact offline preparation command, why digests change, and how the human selects the new manifest; it never prints config contents or credentials.

**Constraints:**
- Reuse existing preparation/hash helpers; extract a small shared helper only if required to avoid duplication or import cycles. No general-purpose config migration framework.
- Preparation may normalize mixed JSON model assignments because it never executes them; execution must continue rejecting mismatches rather than mutating declared sources.
- Do not inspect or modify `api-key-test`, the user's private manifest/workspaces, or provider artifacts during agent validation. Use synthetic fixtures only.

**Validations:**
- `agent`: `python3 -m unittest discover -s scripts/benchmark -p 'test_*.py'` — mixed research/helper fixtures prepare successfully; resulting manifests pass offline input validation with fake pinned checkout evidence; stale digests, unsafe paths, symlinks, malformed agent shapes, unsupported markdown, and non-free manifest models fail without credential access. Existing probe and comparison tests remain valid.
- `agent`: `python3 scripts/benchmark/prepare_evaluation.py --help` — preparation has no credential argument or execution side effect.
- `human`, optional after implementation/review: `python3 scripts/benchmark/prepare_evaluation.py temp/benchmark-testing/evaluation-run.json` — creates new source copies and reports a new manifest path without modifying the old inputs or starting any external runtime. Preparation alone does not authorize a live run.

### Task 2: Fail closed when session capture completeness cannot be proven

**Status:** accepted
**Depends on:** none

**Objective:** Keep the existing 50-export bound while preventing a capped or unresolved capture from being represented as complete all-session usage.

**Context:**
- `scripts/benchmark/run_skillsbench_probe.py::capture_sessions` — shared listing, child traversal, export summaries, restricted index, and session cap.
- `scripts/benchmark/report.py::complete_session_usage` — already rejects non-`captured` statuses; reuse this contract rather than estimating omitted usage.
- `scripts/benchmark/test_run_skillsbench_probe.py::FakeEnv`, `ExecResult`, `evidence` — exercise the actual capture helper, not a mocked `truncated` status alone.
- `scripts/benchmark/evaluation_runner.py::execute` and `_benchflow_attempt` — incomplete usage must stop the schedule.

**Acceptance criteria:**
- A listing at its finite maximum is treated as potentially truncated unless completeness is independently proven. Processing at most 50 exports remains mandatory; do not solve the issue by removing or raising the export cap.
- A cap hit with unseen pending session IDs, invalid/unresolved listed session identities, or other unproven listing coverage yields an explicit incomplete capture status and safe reason metadata. Duplicate already-captured IDs alone do not manufacture incompleteness.
- Available sanitized index/evidence records are retained, but neither runner nor report claims their subset is complete or imputes omitted tokens/cost as zero. Partial capture is useful evidence, not permission to continue.
- A scheduled second attempt is never invoked after an incomplete first capture; the first attempt record preserves the reason for stopping.
- Fully enumerated below-cap captures with complete children retain existing measured-usage behavior. Existing key detection, redaction, version checks, and child traversal remain intact.

**Constraints:**
- Reuse the shared probe helper; do not create an evaluation-only capture implementation.
- No pagination service, unbounded traversal, provider accounting scraper, or attempt retry.

**Validations:**
- `agent`: `python3 -m unittest discover -s scripts/benchmark -p 'test_*.py'` — actual helper fixtures cover 49 complete sessions, an ambiguous 50-session listing, 51 supplied IDs, child expansion beyond the export cap, duplicate IDs, invalid IDs, and missing children. An adapter/ledger integration fixture proves incomplete capture prevents the next scheduled call.

### Task 3: Preserve restricted failure evidence and close the repair review gate

**Status:** accepted
**Depends on:** Task 1, Task 2

**Objective:** Preserve available capture evidence on timeout/runtime failures and validate the repaired preparation-to-record lifecycle against parent Task 1's acceptance criteria.

**Context:**
- `scripts/benchmark/evaluation_runner.py::_benchflow_attempt`, `capture_before_cleanup`, `execute` — SDK lifecycle, cleanup hook, and current empty-evidence exception fallback.
- `scripts/benchmark/budget_contract.py::BudgetLedger` — existing outcome vocabulary, single reservation/finish, unknown-usage and budget stops.
- `scripts/benchmark/test_evaluation_runner.py` — fake SDK modules and environment hooks; extend them to raise before and after capture rather than testing only returned result objects.
- Parent plan Task 1 validation/handoff evidence — historical smoke is useful runner/capture evidence, not task success or proof of provider billing.

**Acceptance criteria:**
- Every recorded non-secret runtime/timeout invocation has explicit capture status and safe index availability, even when no capture was attempted. Include an index reference only when it exists; do not invent result fields or measured usage.
- Evidence already produced during cleanup survives a subsequent SDK exception. Safe failure classification may include a bounded error type/reason code, never arbitrary exception messages, stack traces, raw exports, or agent prose.
- Cleanup/capture ownership is explicit and tested: retain SDK-managed lifecycle behavior without double-cleaning; for supported failure paths, prove whether capture was attempted and resources were cleaned. Failure before environment creation remains explicitly not attempted.
- Timeout, runtime failure, upstream verifier failure, and ledger budget exhaustion remain distinguishable. Preserve complete captured usage when genuinely available; absent/incomplete usage stops further attempts. There is no automatic retry.
- Credential leakage remains a fatal abort, including when detected during cleanup on another failure path. It must not be downgraded to an ordinary recorded runtime outcome or serialized into an attempt artifact.
- A synthetic end-to-end fixture prepares mixed-model input, validates the resulting manifest, reserves an attempt, executes the actual adapter through fake SDK interfaces, and produces a restricted pinned record. Both complete and capped/failure paths are exercised without Docker or credentials.
- `scripts/benchmark/README.md` documents the preparation path, model policy, explicit cap uncertainty, failure evidence, soft between-attempt limits, and human-owned live execution. Parent plan evidence records repairs and any human-reported result without copying sessions/transcripts or claiming independent approval prematurely.
- Independent architecture and functional reviews report the exact reviewed revision, each parent Task 1 criterion, and actionable findings. If independent tooling/review is unavailable, report the gate as blocked; do not self-approve, accept parent Task 1, or begin parent Task 2.

**Constraints:**
- Keep a narrow adapter/result contract; no scheduler, background process, persistence service, or new outcome vocabulary.
- No live benchmark is required to prove these regression fixes. The prior smoke remains historical evidence; do not rerun it automatically.
- Only delivery commits after the declared review gates pass. Plan acceptance does not waive parent acceptance requirements.

**Validations:**
- `agent`: `python3 -m unittest discover -s scripts/benchmark -p 'test_*.py'` — all existing and repair tests pass, including SDK creation failure, failure before capture, failure after cleanup capture, outer timeout, capture failure, and secret detection during failure cleanup.
- `agent`: `python3 scripts/benchmark/evaluation_plan.py scripts/benchmark/evaluation.example.json` — existing offline preview remains valid.
- `human`: no new live run is required. If the maintainer separately elects to smoke-test, first confirm current pricing/free availability, exact mounts/capabilities/environment names, a provider ceiling, and revised finite manifest limits; then use the pinned BenchFlow interpreter with `scripts/benchmark/evaluation_runner.py <new-private-manifest> --key-file <dedicated-0600-key>`. Expected: explicit preflight and one restricted attempt/index, or an explicit safety stop. Never retry automatically or interpret estimated session cost as provider-billed cost.

## Implementation evidence and blocked review handoff

- All three deliverables are implemented locally, **not accepted or committed**.
  Task 1/2 await independent functional review; Task 3 also awaits dependency
  acceptance, independent integration/architecture review, and final acceptance.
  `task: 0/3` counts accepted tasks, not implementation progress.
- `prepare_evaluation.py` validates original pins/digests/files and markdown,
  copies sources into fresh private directories, reuses parameterized
  `prepare_comparison.pin_shared_model` without pruning provider definitions,
  and writes a new digest-bound manifest. Probe defaults and mixed-role behavior
  are unchanged; comparison retains its Big Pickle default and ablation check.
- Runner markdown preflight now accepts only the generated flat model-agnostic
  subset; ordinary/quoted model fields and unsupported YAML fail before key
  access. The shared capture helper retains the 50-export bound and reports cap
  uncertainty, invalid identities, and unresolved children as incomplete.
- The adapter retains capture/index metadata on SDK exceptions/timeouts, records
  cleanup lifecycle flags and bounded reason codes, preserves genuinely complete
  measured usage, and never downgrades secret detection to a runtime record.
- Offline validation: `python3 -m unittest discover -s scripts/benchmark -p
  'test_*.py'` — **86 tests passed**. New synthetic preparation, actual capture,
  and fake-SDK lifecycle tests cover complete/capped paths, no-next-attempt on
  incomplete usage, creation/runtime/timeout/capture/cleanup failures, partial
  indexes, and fatal secret detection during failure cleanup.
- `python3 scripts/benchmark/prepare_evaluation.py --help` and `python3
  scripts/benchmark/evaluation_plan.py scripts/benchmark/evaluation.example.json`
  passed. Python compilation and whitespace checks passed. No Docker, model,
  installer, credential, private manifest/workspace, or provider artifact was
  accessed during validation; only synthetic fixtures were used.
- Follow-on human preflight failure: `code.md:3 (unsupported_field_syntax)`.
  Public installer inspection showed `permissions.ts` inserts `permission:`
  immediately after `description:`; the original allowlist omitted this generated
  format. The validator now accepts its narrowly bounded nested permission
  grammar, retains fixed-category location diagnostics, and still rejects model
  overrides, aliases/merges, duplicate keys, and unsupported syntax. Fixtures now
  render all seven public agent permission blocks, and preparation/adapter tests
  use installed-shaped agents. **90 offline tests passed**; no private files or
  live runtimes were accessed. Independent acceptance remains blocked.
- Subsequent human-reported smoke reached the declared 900-second timeout with
  verifier reward 0.667. Restricted capture and cleanup succeeded; the reviewer
  dispatch was interrupted, so all-session usage remained unproven. Timing
  supplied by the human places reviewer dispatch about 712 seconds into the
  shared allowance. This is timeout/capture evidence, not task acceptance.
- The human then explicitly authorized a one-hour limit. Evaluation validation
  now accepts up to 3,600 seconds, with an outer watchdog of the selected agent
  allowance plus 600 seconds for lifecycle work. Only `attempt_seconds` in the
  selected private prepared manifest was changed; workspace digests, token/cost
  limits, attempt counts, and prior attempts were untouched. The diagnostic probe
  retains its 900-second maximum. **92 offline tests passed**, including the
  3,600/3,601 boundary and fake-SDK propagation/watchdog checks. No live run was
  started; independent acceptance remains blocked.
- Latest human-reported one-hour smoke: agent execution 2,192.3 seconds,
  total 2,277.9 seconds, verifier reward 0.833, no runtime/timeout error.
  Delivery loaded delivery-policy; code and reviewer dispatches completed.
  Capture/index and SDK cleanup succeeded with complete measured session usage:
  113,194 input and 24,429 output tokens against 100,000/20,000 limits. Upstream
  outcome was `verifier_failed`; ledger outcome was correctly `budget_exhausted`
  because both token limits were exceeded. Estimated session cost was zero;
  provider billing remains unknown. Private artifacts/transcripts are not copied
  here. This meets the human smoke's runner-path evidence purpose, not independent
  acceptance, benchmark success, or authorization to retry/increase limits.
- **Review gate blocked:** independent reviewer/architect tooling is unavailable
  in this session. These are implementer test results, not review verdicts.
  Review the exact final working-tree revision, including the initially untracked
  runner/tests and new preparation/lifecycle tests, against every parent Task 1
  criterion. No commit or parent acceptance is authorized by this handoff. Parent
  Task 2 remains blocked. No further human smoke is required; none was started
  by the agent.

### Independent review work orders ready for handoff

- **Work orders:** `repair-final-functional` (`integration_review`) and
  `repair-final-architecture` (`architecture_review`), by reviewers independent
  of the implementer. Read-only: no repairs, commits, live execution, private
  manifests/workspaces, credentials, sessions, or provider artifacts.
- **Objective / criteria:** review all three repair tasks above and every parent
  Task 1 acceptance criterion in
  `2026-11-04_113736-complete-benchmark-evaluation-program.md`. Functional review
  must check test adequacy and the preparation-to-adapter-to-ledger lifecycle;
  architecture review must check model/pre-key policy, source preservation,
  secret/evidence boundaries, cleanup ownership, and ADR-0008 compatibility.
- **Review target:** working tree based on `899bc1c`, including untracked files,
  not just `git diff`. Code/docs scope: `scripts/benchmark/{README.md,
  budget_contract.py,evaluation_runner.py,prepare_comparison.py,
  prepare_evaluation.py,run_skillsbench_probe.py,test_budget_contract.py,
  test_evaluation_lifecycle.py,test_evaluation_runner.py,
  test_markdown_diagnostics.py,test_prepare_evaluation.py,
  test_run_skillsbench_probe.py}`, plus both parent/repair plan evidence sections.
  Code/docs scope fingerprint: SHA-256
  `cf5cc7209dc56847d71d4fa202a545be15d83863142ac7462239c4e38a8abbc9`
  (sorted path names, each UTF-8 name + NUL + file bytes + NUL, concatenated).
- **Validation evidence:** final offline suite rerun: **92 passed**; preparation
  CLI help, evaluation example preview, and scoped whitespace checks passed.
  Reviewers should independently rerun agent-owned validations, not live tests.
- **Expected result:** work order ID/kind, status, summary, changed files (none),
  validation commands/outcomes, risks/findings, `Verdict: pass | changes_required
  | blocked`, exact reviewed revision/fingerprint, each parent Task 1 criterion
  `pass | fail | unverifiable` with evidence, and actionable findings with
  severity/location. No self-approval or premature parent Task 2 work.
- **Commit boundary after passing reviews:** stage only the explicit review scope
  plus these two plans. Exclude `.agents/`, `auto.sh`, `api-key-test`, and all
  ignored/private runtime artifacts. No files are staged and no commit has been
  created by this handoff.

## Review and acceptance evidence

- Independent functional/integration review (`repair-final-functional`) passed on the
  working tree based on `899bc1c`, fingerprint
  `cf5cc7209dc56847d71d4fa202a545be15d83863142ac7462239c4e38a8abbc9`.
  It found the parent Task 1 criteria met and no repair findings.
- Independent architecture review (`repair-final-architecture`) passed on the same
  revision and fingerprint. It confirmed pre-key model policy, immutable source
  preparation, ADR-0008 model-agnostic agent compatibility, finite capture,
  restricted failure evidence, cleanup ownership, and secret-abort boundaries.
- Final agent-owned validation rerun on that reviewed revision:
  `python3 -m unittest discover -s scripts/benchmark -p 'test_*.py'` — 92 passed.
  `prepare_evaluation.py --help`, the evaluation example preview, Python
  compilation, and whitespace checks passed. No private manifest, credentials,
  provider artifact, Docker, or live model execution was accessed.
- All repair tasks and their declared review gates are accepted. This record
  authorizes the scoped delivery commit; parent Task 2 may proceed only under
  its own plan dependency and review gates.

## Out of scope

- Parent Tasks 2–4: live report conversion, paired model execution, and human workflow-quality assessment.
- Changing task/verifier inputs, installing into this repository's generated runtime, or changing provider/model installer defaults.
- Reading/staging credentials, raw sessions, transcripts, private configs, provider state, or billing extracts.
- Raising budgets, executing Docker/models, waiving independent review, or accepting the parent runner task during planning.
