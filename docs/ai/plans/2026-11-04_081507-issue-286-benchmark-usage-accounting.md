---
status: completed
created: 2026-11-04
task: 3/3
---

# Issue #286 benchmark usage accounting implementation plan

**Goal:** Make the benchmark workbench report honest, complete per-attempt usage so a
missing token count or cost fails closed instead of appearing as `0` or `null`.

**Architecture:** Three offline layers already exist and are disconnected. The probe
(`run_skillsbench_probe.py`) captures OpenCode session evidence and prints BenchFlow's
flattened ACP counters; `report.py` renders usage but expects a different session shape;
`budget_contract.py`/`evaluation_plan.py` already fail closed on incomplete usage. The
fix makes the probe emit one normalized, source-labelled usage record, teaches
`report.py` to consume the probe's own export index, and records per-source agreement
instead of collapsing everything into one number. No live benchmark, Docker, or model
call is part of this plan.

**Tech Stack:** Python 3 stdlib (`unittest`, `json`, `decimal`). Existing offline runner:
`python3 -m unittest discover -s scripts/benchmark -p 'test_*.py'`.

**Scope classification:** `multi-task`

**Branch:** `feature/issue-286-benchmark-usage-accounting`, based on
`origin/feature/issue-231-proportionate-workflow` (the benchmark workbench is not on
`develop`).

## Diagnosis (from issue #286 scouting, 2026-11-04)

| # | Gap | Evidence |
| --- | --- | --- |
| 1 | The export index records `id`/`parent_id`/`agent`/`tool_events`/`evidence_file` but never tokens or cost; usage lives only in `<sid>.evidence.json`. No consumer reads both. | `run_skillsbench_probe.py:299-377` |
| 2 | BenchFlow's `usage_tracking`, `trajectory_summary`, and `timing` are never read; only `n_input_tokens`/`n_output_tokens`/`cost_usd` are printed, so `usage_source: unavailable` is indistinguishable from a real zero. | `run_skillsbench_probe.py:470-487`; report doc `skillsbench-compatibility-2026-10-31.md:28,67,73,91` |
| 3 | `report.py::complete_session_usage` expects `session_id`/`tokens`/`cache_tokens`/`cost`; fed the probe's index it returns `None`, i.e. everything `unverifiable`. | `report.py:134-166` |
| 4 | A `task` tool that never completed (timeout) yields no `child_session_id`, so the child is never exported and its usage silently disappears while the root totals still look complete. | `run_skillsbench_probe.py:345-349`; `report.py:160-163` |
| 5 | No fixture or test models "agents ran, BenchFlow says 0 tokens / `cost_usd: null`", the exact #286 observation. | `test_report.py:11-49` |
| 6 | Docs state the gap in prose only; no page says which figure is measured, estimated, or unavailable per source. | `scripts/benchmark/README.md:47-62` |

Line numbers above are from commit `9d2a687` (pre-change); the symbol names are
stable at HEAD. The upstream mechanism behind the zero/null result was not
confirmed in BenchFlow 0.6.3's own source, which is outside this repository's
boundary: the recorded evidence points at the ACP usage event existing only for
a completed agent prompt (the 870-second completed attempt reported
`agent_native_acp` tokens, the 900-second aborted one reported `unavailable`
with zero counters), with child-agent omission as a second, separate loss. The
workbench therefore fails closed instead of asserting a cause.

## Tasks

### Task 1: Emit a normalized, source-labelled usage record from the probe

**Objective:** The probe writes and prints every usage figure it can see, labelled with
its source, and never converts "not reported" into `0`.

**Files:**
- Modify: `scripts/benchmark/run_skillsbench_probe.py` (`session_evidence`,
  `capture_sessions`, `main`)
- Create: `scripts/benchmark/test_run_skillsbench_probe.py`
- Validate: `scripts/benchmark/test_run_skillsbench_probe.py`

**Step 1: Establish expected behaviour**

Define one helper with a pure, testable contract, e.g.
`usage_record(session_evidence) -> {"source": "session_export", "tokens": {...},
"cache_tokens": {...}, "cost_usd": "<str>|None", "status": "measured"}`:

- Non-numeric or absent fields become `None`, never `0`.
- Each `capture_sessions` index record gains a `usage` block copied from that session's
  evidence, so the index alone is sufficient for reporting.
- `main` reads `result.usage_tracking` defensively (dict-or-missing) and prints
  `{"source": "benchflow_acp", "status": "measured|unavailable", "input_tokens": ...,
  "output_tokens": ..., "cache_read_tokens": ..., "cost_usd": ...}` alongside the
  existing flat counters, which stay for backward compatibility.
- A response where `tokens` are absent and `cost` is absent must produce `status:
  "unavailable"`, not zeros. Do not touch timeouts, exit codes, or key handling.

**Step 2: Add or update validation**

New `test_run_skillsbench_probe.py` (plain `unittest`, import the module directly — it
imports `benchflow` only inside `main`, so it stays importable offline). Cover: full
evidence → measured record with exact values; missing `tokens`/`cost` → `None` +
`unavailable`; string cost → `None`, not a crash; index record includes the `usage`
block; `usage_tracking` absent or `status: unavailable` in a fake result → `unavailable`.

**Step 3: Write minimal implementation**

Add `usage_record()` and the `usage` field in the index record; add a
`benchflow_usage()` reader used only for printing. Keep the summary JSON small and free
of session content.

**Step 4: Run test to verify pass**

Run: `python3 -m unittest discover -s scripts/benchmark -p 'test_*.py'`
Expected: all existing 25 tests plus the new ones pass; no network, Docker, or BenchFlow
import at module load.

**Step 5: Commit**

`git add scripts/benchmark/run_skillsbench_probe.py scripts/benchmark/test_run_skillsbench_probe.py`
`git commit -m "feat(benchmark): record usage per source and never coerce missing data to zero (Issue #286)"`

---

### Task 2: Reconcile usage in `report.py` and fail closed on missing child usage

**Objective:** The report consumes the probe's index shape, keeps per-role totals, and
reports source disagreement (for example BenchFlow zero versus non-zero session totals)
instead of hiding it.

**Files:**
- Modify: `scripts/benchmark/report.py` (`complete_session_usage`, `attempt_report`,
  `usage_delta`, `summarize_rows`)
- Modify: `scripts/benchmark/test_report.py`
- Modify: `scripts/benchmark/report.example.input.json`
- Validate: `scripts/benchmark/test_report.py`

**Step 1: Establish expected behaviour**

- Accept both session shapes: keep `session_id` support, additionally accept the probe's
  `id` + `usage` block. Document the accepted shape in the function docstring.
- Keep `all_session_tokens` and `runtime_estimated_cost_usd` as today (summed), and add
  `per_agent` totals keyed by session `agent`, still inside the estimated block so no
  consumer silently drops it.
- Add `usage_sources`: one entry per source seen
  (`session_export`, `benchflow_acp`, `provider_billed`) with `status`
  (`measured`/`partial`/`unavailable`), and `benchflow_undercount: true` when BenchFlow
  reports zero or unavailable tokens/runtime cost while session totals are non-zero.
- Treat a `task` tool that is missing, error-status, or without a resolvable
  `child_session_id` as incomplete child usage: keep usage `unverifiable` (fail closed)
  and add `missing_child_usage: true`. Do not guess the child's tokens.
- Never compare or subtract an unavailable value; `usage_delta` keeps returning
  `unverifiable` when either side is missing.

**Step 2: Add or update validation**

Extend `test_report.py` with fixtures modelled on the 2026-11-02 attempt: three sessions
(`delivery` root, `code` child, no `reviewer`), one completed `task` tool, plus a
`benchflow_acp` source reporting `0` tokens and `cost_usd: null`. Assert:
`benchflow_undercount is True`, `all_session_tokens` equals the session sum, and
`missing_child_usage is True`. Add: probe-shaped index input produces measured usage;
a failed or unresolved `task` tool produces `unverifiable`; `per_agent` totals are
correct; an `unavailable` source never yields a `0`-cost delta.

**Step 3: Write minimal implementation**

Implement the normalization and the two new fields; keep every existing key so current
tests and consumers keep working. Update `report.example.input.json` to include the
`usage_sources` block and keep `data_origin: "synthetic"`.

**Step 4: Run test to verify pass**

Run: `python3 -m unittest discover -s scripts/benchmark -p 'test_*.py'`
Run: `python3 scripts/benchmark/report.py scripts/benchmark/report.example.input.json`
Expected: all tests pass; the example report renders `unverifiable` where data is
missing and never prints `0` for an unavailable source.

**Step 5: Commit**

`git add scripts/benchmark/report.py scripts/benchmark/test_report.py scripts/benchmark/report.example.input.json`
`git commit -m "feat(benchmark): reconcile usage sources and fail closed on missing child usage (Issue #286)"`

---

### Task 3: Document measured, estimated, and unavailable figures

**Objective:** A reader can tell, per figure, whether it is measured, estimated, or
unavailable, and how to verify the accounting offline.

**Files:**
- Modify: `scripts/benchmark/README.md`
- Modify: `docs/ai/reports/skillsbench-compatibility-2026-10-31.md`

**Step 1: Establish expected behaviour**

State the diagnosis from this plan in two or three sentences, then a small table:
`session_export` tokens = measured per session (children only when the `task` call
returned a session id); `benchflow_acp` tokens = partial, may omit children, `0` means
"not reported" only when `usage_source: unavailable`; `runtime_estimated_cost_usd` =
OpenCode-reported estimate, often `0` on free models; `provider_billed_cost_usd` =
measured only with a `provider_billing_ref`; everything else = `unverifiable`. State
that a `benchflow_undercount` flag is expected for the 2026-11-02 attempt and must not be
read as zero spend.

**Step 2: Add or update validation**

Human validation (documentation only): re-read both files and confirm every claim
matches `report.py` behaviour and the historical attempt descriptions; no code command
proves prose accuracy.

**Step 3: Write minimal implementation**

Update the "Task 2 execution contract still to integrate" section of the README to say
which parts are now implemented and which still need a supervised run. Add a dated
paragraph to the compatibility report pointing at the new fields.

**Step 4: Run test to verify pass**

Run: `python3 -m unittest discover -s scripts/benchmark -p 'test_*.py'`
Expected: still green (docs must not break fixtures).

**Step 5: Commit**

`git add scripts/benchmark/README.md docs/ai/reports/skillsbench-compatibility-2026-10-31.md`
`git commit -m "docs(benchmark): state which usage figures are measured, estimated, or unavailable (Issue #286)"`

## Validation ownership

| Validation | Owner |
| --- | --- |
| `python3 -m unittest discover -s scripts/benchmark -p 'test_*.py'` | agent |
| `python3 scripts/benchmark/report.py scripts/benchmark/report.example.input.json` | agent |
| Documentation accuracy re-read | human |
| Any live BenchFlow, Docker, or model attempt | human (out of scope; not authorized by this plan) |

## Out of scope

- Running the SkillsBench probe, Docker, or any model call.
- Changing the `base/**` agents, installer, or CLI.
- Deriving provider-billed cost without a maintainer-supplied billing reference.
- Adding `scripts/benchmark` to `make check` or CI.

## Outcome

All three tasks are implemented offline.

| Task | Result |
| --- | --- |
| 1 | `run_skillsbench_probe.py` gained `usage_record()` (per-session usage in every index entry) and `benchflow_usage()` (BenchFlow's view printed as a separate source). Missing values stay `None`; a reported zero stays zero; a source declaring `unavailable` is never labelled `measured`. New `test_run_skillsbench_probe.py` covers records, partial/unavailable cases, child discovery, and the index shape via a fake env. |
| 2 | `report.py` normalizes both session shapes, keeps `per_agent` totals, adds `usage.sources`, `usage.benchflow_undercount`, and `usage.missing_child_usage`, and treats an unfinished or unlinked `task` dispatch — or unparsed tool events — as unverifiable. `test_report.py` grew to cover the 2026-11-02 shape, missing components, undercount by cost gap, and the always-present BenchFlow source; the synthetic example pair is regenerated. |
| 3 | `scripts/benchmark/README.md` documents the measured/estimated/unavailable table plus a "Not measured" list; the compatibility report carries a 2026-11-04 offline accounting update. |

Validation: `python3 -m unittest discover -s scripts/benchmark -p 'test_*.py'` → 51 tests, OK
(two existing `test_prepare_comparison` cases need the ignored
`temp/benchmark-testing` directory to exist). `report.example.output.json`
regenerates byte-identically. No benchmark, Docker, or model call was made, and
no live attempt was performed, so BenchFlow-side usage remains unconfirmed.

### Deviations and accepted limits

- The implemented key is `usage.sources`, not the `usage_sources` written in
  Task 2 Step 1. The nested name reads as part of the existing `usage` block.
- Task 2 Step 2 asked for `missing_child_usage: true` on the 2026-11-02-shaped
  fixture, which Step 1's own rule contradicts: that attempt's single `task`
  call completed and its `code` child was exported, so the flag is `false` and
  the workflow gap is `dispatch_chain: not_observed`. The shipped test asserts
  the rule, not the impossible value.
- Accepted limits, documented in `scripts/benchmark/README.md`: helper and
  `small_model` calls are not separately identifiable; a session's `cost` is
  assumed session-local; retries and pre-session overhead are unattributed;
  capture stops at 50 sessions without a truncation marker; and a `task`
  dispatch with `status: error` is treated as incomplete even when its child
  session was exported and measured (strict fail-closed choice).
