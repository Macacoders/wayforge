---
name: testing
description: Framework-agnostic procedure for deterministic, behavior-driven automated tests.
metadata:
  domain: software
  category: testing
  level: core
---

# Metadata

# Constraints
- [ ] No regression tests without reproduction
- [ ] No global state or cross-test leaks
- [ ] No assertions on internal implementation
- [ ] No order-dependence across executed tests
- [ ] No non-deterministic time/clocks/seeds

# Procedure
- [ ] **Contract Design**
  - [ ] Identify discovery root and runner
  - [ ] Record "before" evidence for failing behavior
  - [ ] Define one behavior contract per test (Given/When/Then)
- [ ] **Implementation**
  - [ ] Reproduce failing behavior explicitly
  - [ ] Mock/stub boundaries (network, FS, DB, clock)
  - [ ] Prefer observable outcomes (Return, Error, Side Effects)
  - [ ] Include negative and edge case coverage
- [ ] **Stabilization**
  - [ ] Ensure fail messages are actionable (expected vs actual)
  - [ ] Run targeted tests; then run relevant suite
  - [ ] Confirm local and CI parity; treat flakiness as defect
