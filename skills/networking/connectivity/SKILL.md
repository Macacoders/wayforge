---
name: connectivity
description: Diagnose and resolve network connectivity issues.
metadata:
  domain: networking
  category: diagnostics
---

# Metadata
# Constraints
- [ ] No intrusive changes without rollback safety
- [ ] No assumptions without supporting evidence (logs/packet captures)
- [ ] Isolate transport layer vs application layer early
- [ ] Record commands and outputs for audit trail

# Procedure
- [ ] **Diagnostics**
  - [ ] Confirm topology, DNS, route, and firewall basics
  - [ ] Compare healthy vs failing path observations
  - [ ] Run: `ping`, `traceroute`, `dig`, `nc -zv`, `curl -v`
  - [ ] Capture evidence: `tcpdump` or service logs
- [ ] **Hypothesis & Fix**
  - [ ] Identify root cause; change one variable at a time
  - [ ] Implement mitigation; verify behavior parity
- [ ] **Validation**
  - [ ] Confirm resolution across entire failure domain
  - [ ] Run post-checks and document verification evidence
- [ ] **Rollback**
  - [ ] Revert changes if mitigation fails or symptoms worsen
  - [ ] Verify restoration of baseline (even if failing)
