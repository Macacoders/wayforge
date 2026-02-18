---
name: terraform-change-plan
description: Safely plan and apply Terraform changes with state hygiene, blast radius review, and rollback awareness.
user-invokable: true
license: MIT
metadata:
  domain: infrastructure
  category: terraform
  framework: terraform
  depends_on: infra-change-core
  risk-level: high
argument-hint: "Provide workspace/environment, module path, backend/state details, and desired change (plan/apply/import/taint/rollback)."
---

# Skill: Terraform Change Plan

## Composition rule

Apply `infra-change-core` first. Then apply the Terraform-specific guidance below.

## Trigger (when to use)

Use this skill when creating, reviewing, or applying Terraform changes, especially when stateful resources or shared environments are involved.

## Inputs expected

- Terraform version and module path.
- Workspace/environment and backend/state configuration.
- Change objective and constraints (downtime, cost, security).
- Providers involved and credentials method.
- Existing plan/apply workflow (CI, manual approvals).
- Known sensitive resources (networks, IAM, databases).

## Procedure

1. Confirm environment and state target:
   - terraform version, workspace, backend
2. Capture baseline:
   - `terraform init` (backend verified)
   - `terraform workspace show` (if used)
   - note current deployed version/tag (if tracked)
3. Format and validate:
   - `terraform fmt -recursive`
   - `terraform validate`
4. Generate a plan with stable inputs:
   - ensure variables match environment (tfvars, env vars)
   - run `terraform plan -out planfile`
5. Review blast radius:
   - identify creates/destroys/replaces
   - flag any forced replacements and why
   - check network/IAM/security group changes carefully
6. Confirm drift vs intended change:
   - if drift is large, separate drift correction from feature change when possible
7. Apply guardedly:
   - `terraform apply planfile` (avoid unreviewed applies)
8. Verify post-apply:
   - re-run `terraform plan` to confirm no remaining changes
   - validate dependent service health (connectivity, endpoints, auth)
9. Rollback awareness:
   - understand rollback usually means “apply previous config” or restore from backups
   - avoid “quick fixes” that corrupt state
10. State hygiene:
   - avoid manual state edits unless last resort
   - use `import` for existing resources rather than recreate
11. Record change note:
   - plan summary (counts, key resources)
   - apply output highlights
   - verification evidence and any follow-ups

## Output template

- Target environment:
  - <workspace/backend/module>
- Baseline:
  - <init/validate status + current assumptions>
- Plan summary:
  - add/change/destroy counts
  - key resources affected
  - forced replacements (if any)
- Apply:
  - <approved? executed? outputs>
- Verification:
  - <post-plan clean + service checks>
- Rollback notes:
  - <how to revert safely in this context>
- Follow-ups:
  - <debt, drift, missing automation>

## Common failure modes

- Applying against the wrong workspace/backend.
- Running `apply` without reviewing a saved plan.
- Large drift mixed with intended change, obscuring risk.
- Accidental resource replacement (especially networking/IAM).
- Credentials or variable mismatch between local and CI.
- Manual changes outside Terraform causing recurring drift.
- Attempting rollback without understanding state consequences.
