---
name: infra-core
description: Core principles for safe infrastructure and system changes.
metadata:
  domain: infrastructure
  category: core
---

# Metadata
# Constraints
- [ ] No destructive changes without verified backups
- [ ] No changes without explicit baseline capture
- [ ] No "latest" tags in production (use digests/versions)
- [ ] Maintain audit trails and rollback safety
- [ ] Change one variable at a time

# Procedure
- [ ] **Preparation**
  - [ ] Confirm target environment, scope, and blast radius
  - [ ] Capture baseline: config, logs, health, and dependencies
  - [ ] Define success criteria and verification checkpoints
- [ ] **Execution**
  - [ ] Apply changes incrementally; monitor for drift
  - [ ] Use idempotent methods; prefer structured tools
  - [ ] Verify each step before proceeding
- [ ] **Validation**
  - [ ] Confirm stable health over observation window
  - [ ] Verify dependent service connectivity
  - [ ] Document applied diff, commands, and evidence
- [ ] **Rollback**
  - [ ] Revert to baseline on failure or timeout
  - [ ] Verify restoration of original state
