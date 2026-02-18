---
name: test-harness-junit
description: JUnit-specific adapter for applying the Test Harness Core in Java projects.
user-invokable: true
license: MIT
metadata:
  domain: software
  category: testing
  language: java
  framework: junit
  depends_on: test-harness-core
---

# Skill: Test Harness (JUnit Adapter)

## Composition rule

Apply **Test Harness Core** first. Then apply the JUnit-specific guidance below. If there is a conflict, this adapter wins for JUnit projects.

## Trigger (when to use)

Use this skill when adding or repairing Java tests using JUnit (4/5) to validate behavior, prevent regressions, or reproduce a bug reliably.

## Inputs expected

- Target classes/modules under test.
- Build tool context (Maven/Gradle) and JUnit version (4 vs 5).
- Project test conventions (package naming, test naming, surefire settings).
- Bug report or behavior specification.
- Fixture data and environment constraints.

## Procedure (JUnit specifics)

1. Confirm JUnit major version and how tests are discovered (Surefire/Failsafe).
2. Use JUnit 5 idioms when available (`@Test`, `@BeforeEach`, `@ParameterizedTest`, `@TempDir`).
3. Prefer parameterized tests for input variants; keep one behavior per test.
4. Use `assertThrows` for exception semantics and include message checks only when stable.
5. Avoid shared mutable fixtures; prefer per-test setup (`@BeforeEach`) over static state.
6. For time, use injectable clocks where possible; otherwise isolate time-dependent logic.
7. Mock external systems at boundaries (e.g., Mockito) and avoid mocking the class under test.
8. Keep assertions on public behavior; avoid asserting private method outcomes.
9. Ensure deterministic ordering: do not rely on test execution order.
10. Split unit vs integration tests:
    - Unit tests: fast, isolated, default suite.
    - Integration tests: tagged/named and run separately if the project supports it.
11. Run:
    - Targeted: `mvn -Dtest=... test` or Gradle equivalent
    - Suite: `mvn test` / `gradle test`
12. Ensure failure output is useful (assert messages, readable expected vs actual).

## Output template (additions)

- Tooling:
  - build tool, JUnit version, test command(s)
- Notes:
  - <JUnit-specific pitfalls addressed: parameterization, temp dirs, mocking>

## Common failure modes (JUnit-specific)

- Mixing JUnit 4 and 5 annotations without proper runners/engines.
- Using shared static state across tests causing order dependence.
- Over-mocking leading to tests that don’t reflect real behavior.
- Parameterization implemented via copy-paste instead of `@ParameterizedTest`.
- Integration tests accidentally executed in the unit test phase.
