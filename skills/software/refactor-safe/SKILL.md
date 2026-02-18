---
name: refactor-safe
description: Perform behavior-preserving structural changes with minimal regression risk and controlled validation.
user-invokable: true
license: MIT
metadata:
  domain: software
  category: maintenance
  risk-level: medium
---

# Skill: Safe Refactor

## Trigger (when to use)

Use this skill when changing code structure (not product behavior) to improve maintainability with low regression risk.

## Inputs expected

- Refactor objective and non-functional constraints.
- Target module boundaries and dependency graph.
- Existing tests and critical execution paths.
- API compatibility requirements.
- Reason the refactor is necessary (readability, debt reduction, duplication removal, etc.).

## Procedure

1. Define refactor scope, intent, and forbidden behavior changes.
2. Confirm the refactor does not cross unintended architectural boundaries.
3. Identify externally observable contracts (APIs, outputs, logs, metrics).
4. Capture baseline tests and key runtime behavior.
5. Add characterization tests if coverage is weak.
6. Split refactor into small, reviewable commits.
7. Prefer mechanical moves before logic edits.
8. Rename symbols with automated tools when available.
9. Keep public API stable unless explicitly approved.
10. After each step, run nearest tests.
11. Watch for hidden side effects in initialization order.
12. Preserve error semantics and logging contracts.
13. Remove dead code only when confidence is high.
14. Re-check performance-sensitive and integration paths after structural edits.
15. Update structural documentation and comments where relevant.
16. Run broader suite before final handoff.
17. Confirm static analysis and lint warnings did not regress.
18. Verify observability hooks (metrics/logs/traces) remain intact.
19. Summarize exactly what was behavior-preserving.
20. Flag residual debt not addressed in this pass.
21. Provide rollback notes for risky segments.

## Output template

- Refactor goal:
  - <what got cleaner and why>
- Behavior contract preserved:
  - <public APIs / integration boundaries>
- Change slices:
  - S1: <scope + validation>
  - S2: <scope + validation>
- Risk notes:
  - <areas needing follow-up>
- Validation summary:
  - tests run, status, gaps

## Common failure modes

- Blending refactor and feature work in one change.
- Large diffs that block review and rollback.
- Silent API drift from renames/moves.
- Missing characterization tests before edits.
- Breaking initialization or dependency injection order.
- Removing code paths still used indirectly.
- Skipping broader suite before merge.
- No clear statement of preserved behavior.
- Silent telemetry regressions after moving instrumentation.
- Refactor scope creep that changes runtime behavior unintentionally.
