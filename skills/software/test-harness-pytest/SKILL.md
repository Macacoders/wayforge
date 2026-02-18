---
name: test-harness-pytest
description: pytest-specific adapter for applying the Test Harness Core in Python projects.
user-invokable: true
license: MIT
metadata:
  domain: software
  category: testing
  language: python
  framework: pytest
  depends_on: test-harness-core
---

# Skill: Test Harness (pytest Adapter)

## Depends on

- skills/software/test-harness-core/SKILL.md

## Composition rule

Apply **Test Harness Core** first. Then apply the pytest-specific guidance below. If there is a conflict, this adapter wins for pytest projects.

## Trigger (when to use)

Use this skill when adding or repairing Python tests using pytest to validate behavior, prevent regressions, or reproduce a bug reliably.

## Inputs expected

- Target modules/functions/classes under test.
- Python environment context (venv/poetry/pyenv), pytest version.
- Test command(s) used locally and in CI (incl. markers, paths).
- Bug report or behavior specification.
- Fixture needs (filesystem, env vars, network), async needs, and constraints.

## Procedure (pytest specifics)

1. Confirm pytest invocation and root discovery (where `pytest` is run from).
2. Prefer simple test functions; use classes only when it improves clarity.
3. Use fixtures to manage setup/teardown; keep fixtures small and composable.
4. Prefer `tmp_path` / `tmp_path_factory` for filesystem isolation.
5. Use `monkeypatch` for env vars, time, and boundary behaviors; undo is automatic.
6. Use `pytest.mark.parametrize` for variant inputs; avoid copy-paste tests.
7. For exceptions, use `pytest.raises` and check message only when stable.
8. Avoid asserting internal implementation details; assert observable outputs/side effects.
9. Keep tests independent; avoid cross-test shared state (global caches, singletons).
10. Mark and separate slow/integration tests (`@pytest.mark.slow`, `@pytest.mark.integration`) if used in the repo.
11. Stabilize time and randomness:
    - inject RNG/seed when possible
    - patch time sources when needed
12. If async is used, align with the project’s convention (`pytest-asyncio` etc.) and mark accordingly.
13. Run:
    - Targeted: `pytest -k <pattern> -q`
    - File/module: `pytest path/to/test_file.py`
    - Suite: `pytest`
14. If coverage is used, prefer repo-standard tooling (often `pytest-cov`) and avoid chasing % over critical path coverage.

## Output template (additions)

- Tooling:
  - python version, pytest version, command(s)
- Fixtures added/updated:
  - F1: <fixture name> — <purpose>
- Markers used:
  - <markers>

## Common failure modes (pytest-specific)

- Overusing fixtures to the point tests become opaque.
- Leaking state via globals/caches between tests.
- Missing isolation for filesystem/environment dependencies.
- Parameterization done by duplication instead of `parametrize`.
- Flaky tests caused by real time, network, or ordering assumptions.
- CI mismatch due to different working directory, env vars, or plugin set.
