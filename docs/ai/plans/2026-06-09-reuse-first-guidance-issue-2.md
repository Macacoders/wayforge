# Reuse-First Workflow Guidance (Issue #2)

Date: 2026-06-09  
Repository root: `/home/pabloben/dev/ai-config`  
Status: Phase 1 complete  
Issue: #2

## Goal

Add source-of-truth workflow and prompt guidance that makes agents prefer reasonable reuse before creating new repeatable logic, while avoiding speculative abstraction, broad refactors, and unnecessary copying.

## Confirmed Decisions

- Do not touch `.opencode/**`; it is generated/local output for this task.
- Include the `test` agent in reuse-first guidance.
- This is prompt/documentation work only; no product runtime behavior or installer logic changes are expected.

## Scope Files

- `base/opencode/agents/planner.md`
- `base/opencode/agents/code.md`
- `base/opencode/agents/quickcode.md`
- `base/opencode/agents/test.md`
- `templates/AGENTS.md`
- `README.md`

## Acceptance Criteria

- Before creating new repeatable logic, agent guidance tells implementation agents to inspect reasonable existing patterns, utilities, scripts, helpers, commands, or conventions within task scope.
- Planner handoff templates include an explicit reuse expectation/check when a change touches repeatable logic.
- Code and quickcode reports include whether existing code/patterns were reused or why new logic was necessary.
- Test agent guidance includes reuse-first review of existing tests/helpers/coverage before recommending or writing new tests.
- New duplication must be justified or flagged as debt/risk.
- Guidance explicitly avoids speculative abstraction and broad refactors while also discouraging unnecessary copying.
- Documentation reflects the workflow contract at a high level.
- `.opencode/**` remains untouched.

## Phase 1 — Source-of-Truth Reuse-First Guidance

Status: Complete

Atomic stages:

1. Create this durable plan/status memory for issue #2. — Complete
2. Update source-of-truth agent prompts with concise reuse-first rules and handoff/report fields. — Complete
3. Update reusable docs/guidance in `templates/AGENTS.md` and `README.md`. — Complete
4. Run safe validation/review commands and provide phase completion summary. — Complete

## Validation Strategy

- Review `git status` and `git diff` for intended files only.
- Perform documentation review for concise workflow-contract coverage.
- No new tests are expected because the work is docs/prompt-only.
