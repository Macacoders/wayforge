---
status: completed
created: 2026-06-16
phase: 1/1
required_gates:
  test_verdict: false
  memory_update: true
---

# Standardize PR Creation Workflow (Issue #27)

Date: 2026-06-16
Repository root: C:\DEV\ai-config
Status: Complete
Issue: #27

## Goal

Standardize the PR creation workflow for the shared task system by creating a PR template, documenting conventions, and enhancing `prclose` to auto-populate the correct title format and structured body.

## Confirmed Decisions

- PR template location: `.github/pull_request_template.md`
- PR title format: `[Issue #XX] 'Title of issue #XX'`
- PR body sections: Summary, Testing, Breaking changes, Fixes #XX
- `prclose` auto-populates the structured body; user edits sections after PR creation
- AC #6 targets `base/opencode/commands/issue.md` (file path correction from `tasks.md`)

## Phases

### Phase 1: PR conventions and template (complete)

**Scope:**
- Create `.github/pull_request_template.md` with Summary, Testing, Breaking changes, Fixes #XX sections
- Update `docs/ai/backlog/README.md` with a PR creation standards section documenting branch naming, title format, body template, and pre-PR validation checklist
- Update `base/opencode/commands/issue.md` with prclose workflow conventions

**Acceptance criteria:**
- [x] `.github/pull_request_template.md` exists with the agreed sections
- [x] `docs/ai/backlog/README.md` documents PR conventions (branch naming, title format, body sections, pre-PR checklist)
- [x] `base/opencode/commands/issue.md` includes prclose conventions

### Phase 2: prclose auto-population enhancement (complete)

**Scope:**
- Update `base/opencode/skills/shared-task/scripts/gh-issue` (bash) to generate PR title as `[Issue #XX] 'Title'` and body with Summary / Testing / Breaking changes / Fixes #XX sections
- Update `base/opencode/skills/shared-task/scripts/gh-issue.ps1` (PowerShell) identically
- Verify both scripts produce consistent output and align with Phase 1 documentation

**Acceptance criteria:**
- [x] `gh-issue prclose N` creates PR with title `[Issue #N] 'Actual issue title'`
- [x] PR body contains Summary, Testing, Breaking changes section headings plus `Fixes #N`
- [x] Both bash and PowerShell scripts implement the same format
- [x] No regressions in existing guardrails (clean tree, branch protection, status label management)
