# ADR-0039: Remove the `test` Agent

**Date**: 2026-09-11
**Status**: Accepted

## Context

The `test` subagent independently reviewed implemented work for regression risk and authored tests only under opt-in authorization (ADR-0006). With the task-based plan workflow (Issue #47), test creation is specified directly in the plan task (an "add/update validation" step and a "run test to verify pass" step) and executed by `code` as part of implementation, so a separate review-and-author agent is redundant.

## Decision

1. **Remove the `test` agent** (`base/opencode/agents/test.md`) and the `test-handoff-template.md` reference.
2. **Fold test authoring into `code`**: the plan task's validation and test steps are implemented by `code`; `/review-task` confirms the validation was run and matches acceptance criteria.
3. **Remove `test` from permissions/config**: drop the `test:` block and the `test: allow` task-gating entries in `permissions/agents.yml`, and the `test` model assignments from the provider agent blocks.
4. **Drop the `test_verdict` gate** from plan frontmatter `required_gates`.

## Supersedes

- ADR-0006 (make new tests opt-in).

## Consequences

- Three subagents remain: `research`, `code`, `architect`.
- Test creation is driven by explicit plan-task steps rather than a separate reviewer; there is no default test delegation.
- `architect` remains the only independent review agent (boundary review).
