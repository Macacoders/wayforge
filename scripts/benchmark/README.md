# Benchmark evaluation workbench

For the next-agent coding handoff, read the **Handoff for the next agent**
section of `docs/ai/plans/2026-10-31_224912-benchmark-backed-harness-evaluation.md`.

The pinned SkillsBench/BenchFlow probe is a human-supervised Task 1 interface
check. Its upstream verifier output is an outcome measure. The current ACP
trajectory does not name child agents or the loaded skill, so it does not prove
the complete Wayforge workflow. The 2026-11-01 maintainer waiver permits
offline Task 2 work; it does not turn that missing evidence into a pass.

## Current commands

- `prepare_skillsbench_probe.py` prepares a disposable install from tracked
  Wayforge source after an installer dry-run. It makes no model or Docker call.
- `run_skillsbench_probe.py` runs one human-supervised upstream attempt with
  mount inspection and the dedicated free-model key. It is not a repeated or
  budgeted evaluation runner. Do not invoke it while free requests are being
  rejected or treat a partial reward as verified resolution.
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
  and restricted session summaries. The checked-in
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

## Task 2 execution contract still to integrate

The runner should call the pinned upstream rollout for each explicitly chosen
task, variant, and repetition, always from the same unmodified task package
and a fresh disposable workspace. Before starting each attempt, reserve its
declared worst-case cost and finite token/time exposure. The provider spending
ceiling must be confirmed independently; the local ledger is a soft cap, not
an in-flight kill switch. A missing cost or child-agent usage record stops all
following attempts. Timeout, budget exhaustion, runtime error, and upstream
verifier failure are distinct outcomes; none is retried silently.

The existing probe has not demonstrated complete child-agent usage or a
credential boundary suitable for paid tasks. A live Task 2 smoke attempt and
paid execution remain human-owned and unvalidated. No benchmark command is
part of the regular test suite or `make check`.
