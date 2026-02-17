# Skill: JUnit Test Harness

## Trigger (when to use)

Use this skill when adding or repairing Java/JUnit tests to validate behavior, prevent regressions, or reproduce a bug reliably.

## Inputs expected

- Target classes or modules under test.
- Build tool context (Maven/Gradle) and JUnit version.
- Bug report or behavior specification.
- Test data fixtures and environment constraints.

## Procedure

1. Confirm JUnit version and test execution command.
2. Reproduce current failing behavior if available.
3. Define one test per behavior contract.
4. Structure tests as arrange/act/assert.
5. Use deterministic inputs and fixed clocks/seeds.
6. Mock external dependencies at system boundaries.
7. Prefer integration tests only when unit seams are weak.
8. Name tests by behavior, not implementation.
9. Add negative and edge-case assertions.
10. Assert on observable outcomes, not internals.
11. Minimize fixture complexity and duplication.
12. Keep test runtime fast; isolate slow paths.
13. Run targeted tests first, then package/module suite.
14. Verify failure message clarity for future debugging.
15. Ensure flaky tests are stabilized before merge.
16. Document assumptions in test names or helper methods.
17. Capture before/after result for bug-fix scenarios.
18. Report coverage impact qualitatively if tooling absent.
19. Ensure CI command and local command produce equivalent outcomes.
20. Add one regression test for the most likely future breakage.

## Output template

- Test target:
  - <class/module>
- Added/updated tests:
  - <test name> — <behavior>
- Execution:
  - command, pass/fail, duration
- Bug reproduction status:
  - reproduced | not reproduced
- Confidence statement:
  - high | medium | low + reason
- Follow-up test ideas:
  - <items>

## Common failure modes

- Tests coupled to implementation details.
- Non-deterministic timing or random inputs.
- Over-mocking that hides integration defects.
- Missing edge and failure-path coverage.
- Slow tests that get skipped in CI.
- Ambiguous test names and assertions.
- Ignoring flaky behavior instead of fixing it.
- No clear link between test and requirement.
- Tests that pass locally but fail in CI due to environment coupling.
- Overlapping test responsibilities that create brittle maintenance.
