---
name: 5g-testbed
description: Standardized runbook for 5G testbed experiments.
metadata:
  domain: experiments
  category: 5g
---

# Metadata
# Constraints
- [ ] No changes to testbed state without baseline capture
- [ ] No non-reproducible test runs
- [ ] No data collection without NTP/time sync verification
- [ ] Maintain experiment audit trail (commands/logs)

# Procedure
- [ ] **Preparation**
  - [ ] Confirm testbed availability and hardware status
  - [ ] verify NTP/PTP sync; capture baseline logs
- [ ] **Execution**
  - [ ] Apply scenario config; verify target state
  - [ ] Run automated test sequence; monitor for anomalies
- [ ] **Data Collection**
  - [ ] Extract PCAPs, service logs, and UE metrics
  - [ ] Validate collection completeness and timestamp alignment
- [ ] **Teardown**
  - [ ] Restore testbed to baseline state
  - [ ] Document deviations and run summaries
