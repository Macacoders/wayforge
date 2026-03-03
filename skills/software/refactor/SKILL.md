---
name: refactor
description: Safely refactor code without changing its observable behavior.
metadata:
  domain: software
  category: development
---

# Metadata

# Constraints
- [ ] No behavioral changes (functional parity)
- [ ] No regression tests without reproduction
- [ ] No assertions on internal implementation
- [ ] Maintain local and CI parity
- [ ] Reversibility: preserve audit trails and rollback plans

# Procedure
- [ ] **Assessment**
  - [ ] Identify discovery root and runner
  - [ ] Confirm baseline behavior and existing test coverage
  - [ ] Identify core behavior contract to preserve
- [ ] **Implementation**
  - [ ] Use atomic commits/refactors; verify each step
  - [ ] Change code structure; preserve observable outcomes
  - [ ] Run targeted tests; then run relevant suite
- [ ] **Validation**
  - [ ] Ensure local and CI behavior parity
  - [ ] Confirm failure messages are actionable
  - [ ] Document changes made and rationale
- [ ] **Stuck?**
  - [ ] Reproduce current behavior with the smallest example
  - [ ] Compare expected vs actual behavior explicitly
  - [ ] Roll back risky approaches; start simple
