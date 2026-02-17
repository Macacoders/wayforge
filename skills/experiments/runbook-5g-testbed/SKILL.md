# Skill: 5G Testbed Runbook

## Trigger (when to use)

Use this skill for planning and executing reproducible experiments on a 5G or edge-network testbed where environment drift and timing effects can bias results.

## Inputs expected

- Experiment hypothesis and success criteria.
- Testbed topology (RAN/core/UE/emulator components).
- Software versions and configuration files.
- Load profiles, traffic patterns, and run duration.
- Required telemetry sources and collection intervals.

## Procedure

1. Define one primary metric and secondary guardrail metrics.
2. Freeze software/config versions and record hashes.
3. Capture baseline idle-state telemetry.
4. Validate connectivity and time synchronization across nodes.
5. Start services in deterministic order and verify health.
6. Warm up system for fixed interval before measurement.
7. Run a pilot with reduced load to catch obvious faults.
8. Execute controlled runs with one independent variable change.
9. Keep random seeds fixed when possible.
10. Log exact command lines and config snapshots per run.
11. Tag runs with scenario ID, timestamp, and operator.
12. Capture failure events with correlated logs.
13. Repeat each scenario enough times for variance estimate.
14. Stop and quarantine runs with infrastructure anomalies.
15. Aggregate metrics with confidence intervals or dispersion stats.
16. Compare against baseline and previous stable run.
17. Record threats to validity (interference, drift, thermal effects).
18. Produce a run summary and reproducibility checklist.

## Output template

- Experiment ID: <id>
- Hypothesis: <statement>
- Scenario matrix:
  - <varied parameter values>
- Run log summary:
  - runs attempted / runs valid / runs discarded
- Primary metric result:
  - <value + variance>
- Guardrail metrics:
  - <values>
- Notable incidents:
  - <event + impact>
- Reproducibility status: pass | partial | fail
- Next run recommendation:
  - <single most useful follow-up>

## Common failure modes

- Missing baseline and no comparative anchor.
- Drift in software config between runs.
- Hidden time-sync issues corrupting latency metrics.
- Changing multiple variables per run.
- Insufficient repetition to estimate variance.
- Mixing infrastructure failure with experimental signal.
- Incomplete run logs that prevent reproduction.
- Ignoring guardrail metrics while optimizing a single KPI.
