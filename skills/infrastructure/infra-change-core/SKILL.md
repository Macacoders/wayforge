---
name: infra-change-core
description: Safe, reproducible workflow for infrastructure changes with scoped blast radius, verification, and rollback.
user-invokable: false
license: MIT
metadata:
  domain: infrastructure
  category: change-management
  level: core
---

# Skill: Infrastructure Change Core

## Trigger (when to use)

Use this skill for any infrastructure change (containers, clusters, IaC, networking, services) where mistakes can impact availability, security, or cost.

## Inputs expected

- Objective and success criteria.
- Environment and scope (dev/lab/prod-like), access level, constraints.
- Current state snapshot sources (commands, dashboards, configs).
- Blast radius assumptions (what can break, who is affected).
- Rollback strategy (or explicit reason it is not possible).

## Procedure

1. Clarify objective, success criteria, and non-goals.
2. Confirm environment, permissions, and change window.
3. Identify blast radius and critical dependencies.
4. Capture baseline state and evidence (versions, configs, status).
5. Choose the smallest reversible change that can validate progress.
6. Define verification checks (pre/post) and failure thresholds.
7. Prepare rollback steps and required artifacts before applying changes.
8. Apply one change at a time; record commands and outputs.
9. Verify immediately after each change; stop if thresholds are exceeded.
10. If needed, rollback using the prepared path; re-verify baseline.
11. Record final state, root cause (if incident), and prevention actions.
12. Publish a concise change note with reproducibility references.

## Output template

- Objective & success criteria:
  - <what should be true after>
- Scope & blast radius:
  - <components, users, environments>
- Baseline captured:
  - <commands/links + key outputs>
- Planned change:
  - <single change step>
- Verification:
  - pre: <checks>
  - post: <checks + thresholds>
- Rollback plan:
  - <steps + trigger conditions>
- Result:
  - <success/fail + evidence>
- Notes:
  - <follow-ups, prevention>

## Common failure modes

- Changing multiple variables at once.
- No baseline evidence captured before modification.
- Unclear blast radius or dependency chain.
- No rollback path prepared before action.
- Verification based on “looks fine” instead of defined checks.
- Applying changes in the wrong environment (dev vs prod-like).
- Not recording commands/outputs, preventing reproducibility.
