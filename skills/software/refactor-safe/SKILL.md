# Skill: Safe Refactor

## Trigger (when to use)

Use this skill when changing code structure (not product behavior) to improve maintainability with low regression risk.

## Inputs expected

- Refactor objective and non-functional constraints.
- Target module boundaries and dependency graph.
- Existing tests and critical execution paths.
- API compatibility requirements.

## Procedure

1. Define refactor scope and forbidden behavior changes.
2. Identify externally observable contracts.
3. Capture baseline tests and key runtime behavior.
4. Add characterization tests if coverage is weak.
5. Split refactor into small, reviewable commits.
6. Prefer mechanical moves before logic edits.
7. Rename symbols with automated tools when available.
8. Keep public API stable unless explicitly approved.
9. After each step, run nearest tests.
10. Watch for hidden side effects in initialization order.
11. Preserve error semantics and logging contracts.
12. Remove dead code only when confidence is high.
13. Re-check performance-sensitive paths after structural edits.
14. Update docs/comments only where behavior context changes.
15. Run broader suite before final handoff.
16. Summarize exactly what was behavior-preserving.
17. Flag residual debt not addressed in this pass.
18. Provide rollback notes for risky segments.
19. Confirm static analysis warnings did not regress.
20. Verify observability hooks (metrics/logs/traces) remain intact.

## Output template

- Refactor goal:
  - <what got cleaner>
- Behavior contract preserved:
  - <public APIs / outputs>
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
