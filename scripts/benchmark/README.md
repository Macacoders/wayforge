# Benchmark evaluation workbench

For the next-agent coding handoff, read the **Handoff for the next agent**
section of `docs/ai/plans/2026-10-31_224912-benchmark-backed-harness-evaluation.md`.

The pinned SkillsBench/BenchFlow probe is a human-supervised Task 1 interface
check. Its upstream verifier output is an outcome measure. The 2026-11-02
session export captured `delivery`, `skill(name=delivery-policy)`, and a linked
`code` child session, but no `reviewer`; the run timed out after 900 seconds
despite verifier reward `1.0`. ACP's flattened trajectory still does not name
the child or skill. The full Wayforge workflow remains unproven. The
2026-11-01 maintainer waiver permits offline Task 2 work, not a full-chain pass.

## Current commands

- `prepare_skillsbench_probe.py` prepares a disposable install from tracked
  Wayforge source after an installer dry-run. It makes no model or Docker call.
- `run_skillsbench_probe.py` runs one human-supervised upstream attempt with
  mount inspection and the dedicated free-model key. It is not a repeated or
  budgeted evaluation runner. Do not invoke it while free requests are being
  rejected or treat a partial reward as verified resolution. It prints one
  `usage` record for BenchFlow's own ACP view and writes a per-session `usage`
  record into each `session-export-index.json` entry, so the index is
  self-sufficient for reporting.
- `run_evidence_canary.sh` runs one local, non-benchmark `/deliver` canary and
  extracts restricted session evidence. It stops promptly on the observed
  `Free usage limit reached` error.
- `budget_contract.py` defines offline reservation and stop rules for the
  future Task 2 runner. Test it with
  `python3 -m unittest discover -s scripts/benchmark -p 'test_*.py'`.
- `evaluation_plan.py` validates task, variant, revision, model, repetition,
  and budget selections and prints an offline attempt preview. Its fake-runner
  tests exercise no-retry and missing-usage stops. It does not execute an
  attempt. Preview the pinned smoke example with
  `python3 scripts/benchmark/evaluation_plan.py scripts/benchmark/evaluation.example.json`.
- `report.py` renders an offline report from upstream-shaped result objects
  and restricted session summaries. It accepts either the report session shape
  or the probe's `session-export-index.json` shape. The checked-in
  `report.example.input.json` / `report.example.output.json` pair is explicitly
  synthetic; its illustrative variant is not a benchmark result. Generate it
  with `python3 scripts/benchmark/report.py scripts/benchmark/report.example.input.json`.
  No raw session exports or agent prose are inputs to this report layer.
- `prepare_comparison.py` creates a paired, ignored Task 4 baseline and one
  skill-unavailable ablation from the pinned disposable probe install. It
  applies the same Big Pickle model pin to both and verifies that the only
  between-variant file difference is removal of
  `.opencode/skills/delivery-policy/SKILL.md`. Run it with
  `python3 scripts/benchmark/prepare_comparison.py`. It makes no model,
  Docker, or verifier call; its manifest says `not_run`.

## Usage accounting: measured, estimated, unavailable

Until issue #286 the two usage sources were never combined: BenchFlow's
flattened ACP counters could report zero tokens and an unknown cost for an
attempt whose sessions recorded model use. A report now labels every figure
with its source and its status, and a missing figure is never replaced by zero.

| Figure | Meaning | How it can be wrong |
| --- | --- | --- |
| `sources.session_export.tokens` | Measured per-session tokens from the OpenCode export, summed over root **and** child sessions. `per_agent` keeps the per-role split. | Only as complete as the capture: a `task` call that never returned leaves its child unobserved, so the total becomes `unverifiable`. |
| `sources.benchflow_acp.*` | BenchFlow 0.6.3's own counters (`agent_native_acp`). | Partial by construction: it may omit child agents, so `0` can mean "not reported". Never treated as proof of zero spend. |
| `all_session_tokens.runtime_estimated_cost_usd` | Estimated cost: the sum of the costs OpenCode reports per session. | Usually `0` on free models; it is an estimate, not a bill. |
| `provider_billed_cost_usd` | Measured cost, and only when `provider_billing_ref` points at a private billing extract. | `unverifiable` without that reference. The local budget ledger is a soft cap, not a provider-enforced one. |
| `benchflow_undercount` | `true` when BenchFlow reported zero or missing tokens/cost while session totals show model use. | `unverifiable` when the two sources cannot be compared. Never read it as zero spend. |
| `missing_child_usage` | `true` when a dispatch or export gap leaves some child usage unproven. | It does not estimate the missing amount. |

Any figure that is not measured is the string `unverifiable`.

## Task 2 execution contract still to integrate

The runner should call the pinned upstream rollout for each explicitly chosen
task, variant, and repetition, always from the same unmodified task package
and a fresh disposable workspace. Before starting each attempt, reserve its
declared worst-case cost and finite token/time exposure. The provider spending
ceiling must be confirmed independently; the local ledger is a soft cap, not
an in-flight kill switch. A missing cost or child-agent usage record stops all
following attempts. Timeout, budget exhaustion, runtime error, and upstream
verifier failure are distinct outcomes; none is retried silently.

Usage accounting is now represented offline but still unproven against a live
attempt. The probe records both sources, and `report.py` fails closed when a
child session is missing; `budget_contract.py` and `evaluation_plan.py` already
stop following attempts on incomplete usage. The existing probe has not
demonstrated complete child-agent usage or a credential boundary suitable for
paid tasks, and BenchFlow reported zero tokens and unknown cost for the
2026-11-02 attempt, so the accounting path needs one supervised confirmation
before any budget or efficiency claim. A live Task 2 smoke attempt and paid
execution remain human-owned and unvalidated. No benchmark command is part of
the regular test suite or `make check`; run the offline checks with
`python3 -m unittest discover -s scripts/benchmark -p 'test_*.py'`.
