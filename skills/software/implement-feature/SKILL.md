---
name: implement-feature
description: Safely implement new behavior or extend existing functionality with clear contracts, validation, and minimal unintended impact.
user-invokable: true
license: MIT
metadata:
  domain: software
  category: feature-development
  risk-level: medium
argument-hint: "Provide feature description, constraints, affected modules, and acceptance criteria."
---

# Skill: Implement Feature

## Trigger (when to use)

Use this skill when adding new functionality, extending behavior, or introducing new interfaces while preserving system stability.

## Inputs expected

- Feature description and scope.
- Explicit acceptance criteria or expected behavior.
- Affected modules/components.
- Constraints (performance, backward compatibility, environment, security).
- Existing tests and critical execution paths.
- API or integration impact expectations.

## Procedure

1. Clarify feature scope, success criteria, and non-goals.
2. Identify observable behavior changes and new contracts.
3. Confirm compatibility requirements (backward/API stability).
4. Identify integration boundaries and dependent components.
5. Define minimal viable implementation path (avoid speculative extensibility).
6. If possible, write or update a failing test first (behavior-driven).
7. Implement the smallest change that satisfies the contract.
8. Keep modifications localized; avoid opportunistic refactors.
9. Validate nearest unit/integration tests immediately.
10. Add negative and edge-case tests for new behavior.
11. Confirm error semantics are consistent and explicit.
12. Verify logging/metrics/telemetry reflect new behavior where relevant.
13. Re-run broader suite before finalizing.
14. Review performance-sensitive paths if applicable.
15. Update documentation/config examples if external behavior changed.
16. Summarize new behavior clearly and explicitly.
17. Flag technical debt intentionally deferred.
18. Confirm reproducibility (commands to run, configs required).

## Output template

- Feature goal:
  - <what new behavior exists>
- Scope:
  - <modules/files touched>
- New or updated contracts:
  - <API changes / outputs>
- Tests:
  - <new tests + what they validate>
- Validation:
  - commands run, pass/fail, edge cases covered
- Compatibility:
  - backward compatibility status
- Risk notes:
  - <integration/performance concerns>
- Follow-up:
  - <future improvements or debt>

## Common failure modes

- Mixing feature implementation with unrelated refactor.
- Expanding scope beyond original acceptance criteria.
- Introducing implicit API changes without documentation.
- Forgetting negative or edge-case tests.
- Breaking integration points silently.
- Overengineering abstractions prematurely.
- Skipping performance check on hot paths.
- Not documenting behavior changes.
- Failing to update telemetry/log expectations.
- Leaving ambiguous acceptance criteria unresolved.
