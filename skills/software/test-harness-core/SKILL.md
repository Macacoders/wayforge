---
name: test-harness-core
description: Framework-agnostic procedure for writing deterministic, behavior-driven automated tests.
user-invokable: false
license: MIT
metadata:
  domain: software
  category: testing
  level: core
---

# Skill: Test Harness Core

## Trigger (when to use)

Use this skill when adding or repairing automated tests in any language/framework to validate behavior contracts, prevent regressions, or reproduce a bug reliably.

## Inputs expected

- Target module/component under test and its public contract.
- Test runner/framework context and execution command(s).
- Behavior specification or bug report.
- Key fixtures/test data and environment constraints (OS, network, time, CI).

## Procedure

1. Confirm the test runner and the exact command used locally and in CI.
2. Identify the observable behavior contract(s) to validate.
3. Reproduce current failing behavior if available; record “before” evidence.
4. Define one test per behavior contract; keep responsibilities non-overlapping.
5. Structure tests as arrange/act/assert (or given/when/then).
6. Use deterministic inputs; fix time/clocks/seeds and isolate randomness.
7. Prefer asserting observable outcomes (return values, outputs, side effects, errors) over internal state.
8. Include negative tests, edge cases, and exception/error semantics.
9. Mock/stub external dependencies at system boundaries only (network, filesystem, DB, clock) unless integration is required.
10. Keep tests independent and order-agnostic; avoid shared mutable state.
11. Keep runtime fast; isolate slow/integration paths and label them explicitly.
12. Ensure failure messages are actionable (what failed + expected vs actual).
13. Add/adjust minimal helpers/fixtures to reduce duplication without obscuring intent.
14. Run targeted tests first; then run the relevant suite/module/package.
15. Stabilize flaky tests before merge; treat flakiness as a defect.
16. Capture “after” evidence for bug-fix scenarios; link test to requirement/issue.
17. Assess coverage meaningfully (critical paths covered), not only by percentage.
18. Confirm local and CI behavior parity; document environment assumptions.
19. Add one regression test for the most likely future breakage.

## Output template

- Test target:
  - <module/component>
- Contracts covered:
  - C1: <contract>
  - C2: <contract>
- Added/updated tests:
  - <test name> — <behavior>
- Execution:
  - command(s), pass/fail, duration
- Bug reproduction status:
  - reproduced | not reproduced + notes
- Confidence statement:
  - high | medium | low + reason
- Follow-up ideas:
  - <items>

## Common failure modes

- Tests coupled to implementation details.
- Non-deterministic timing or random inputs.
- Over-mocking that hides integration defects.
- Missing edge and failure-path coverage.
- Shared state or ordering dependencies between tests.
- Slow tests that get skipped or avoided in CI.
- Flaky tests left unresolved.
- No clear link between tests and the behavior contract.
- Local-only pass due to environment coupling.
- Over-asserting irrelevant details that makes tests brittle.
