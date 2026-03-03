---
name: terraform
description: Safe Terraform planning and application.
metadata:
  domain: infrastructure
  category: terraform
  framework: terraform
---

# Metadata
# Constraints
- [ ] No applies without reviewed plans
- [ ] No manual state edits unless last resort
- [ ] Avoid large drift mixed with feature changes
- [ ] No destruction of stateful resources without intent

# Procedure
- [ ] **Planning**
  - [ ] Confirm workspace/backend; run `terraform init`
  - [ ] Generate plan: `terraform plan -out planfile`
  - [ ] Review blast radius: identify creates/destroys/replaces
- [ ] **Application**
  - [ ] Flag forced replacements; confirm variables/secrets
  - [ ] Run: `terraform apply planfile`
  - [ ] Re-run plan to confirm zero remaining drift
- [ ] **Validation**
  - [ ] Verify resource creation and provider outputs
  - [ ] Test dependent service health (auth/endpoints)
- [ ] **Rollback**
  - [ ] Revert config to baseline version; re-apply
  - [ ] Restore from state backups if corrupted
