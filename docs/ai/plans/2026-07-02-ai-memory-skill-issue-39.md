---
status: completed
created: 2026-07-02
phase: 1/1
required_gates:
  test_verdict: true
  memory_update: true
---

# Plan: ai-memory Skill — Issue #39

**Date:** 2026-07-02
**Status:** ✅ Complete

## Goal

Create an `ai-memory` OpenCode skill with a deterministic TypeScript helper script that automates `docs/ai/**` bookkeeping (status checks, listings, closeout checklist, and skeleton scaffolding) and integrate it into agent/command workflows.

## Scope Classification

| Field | Value |
|-------|-------|
| **Size** | Multi-phase |
| **Phase budget** | 2 |
| **Phase budget rationale** | Deliverables split into (1) the skill artifact itself and (2) workflow integration — two clearly separable reviewable deliverables. |
| **Quick delivery eligible** | No |
| **Split required** | No |

## Phases

### Phase 1: Skill and TypeScript Script

**Scope:**
- Create `base/opencode/skills/ai-memory/SKILL.md` documenting when and how agents should use the skill.
- Create `base/opencode/skills/ai-memory/scripts/ai-memory.ts` with these subcommands:
  - `status` — report whether `docs/ai/` exists and summarize key memory files/directories
  - `list-plans` — list plan files with status signals (filename, first heading, status line) without printing full contents
  - `list-adrs` — list ADR files with title and number signals
  - `close-check` — report closeout checklist: active plan candidates, monthly log presence, architecture/ADR considerations, dirty worktree state
  - `init` — scaffold missing `docs/ai/` skeleton (README.md, architecture.md, backlog/README.md, decisions/, plans/, logs/) from embedded templates; support `--dry-run` to report what would be created without writing
- Missing `docs/ai/` directories/files handled gracefully across all subcommands.
- Script stays within repository root.
- No external memory frameworks or third-party services introduced.

**Acceptance criteria:**
- [ ] `base/opencode/skills/ai-memory/SKILL.md` exists with correct frontmatter and concise usage guidance
- [ ] `base/opencode/skills/ai-memory/scripts/ai-memory.ts` exists with all 5 subcommands
- [ ] `npx tsx ai-memory.ts status` runs without errors in both populated and empty `docs/ai/` states
- [ ] `npx tsx ai-memory.ts status --json` outputs valid JSON
- [ ] `npx tsx ai-memory.ts list-plans` lists plan files with status signals
- [ ] `npx tsx ai-memory.ts list-adrs` lists ADR files with title/number signals
- [ ] `npx tsx ai-memory.ts close-check` reports closeout checklist (plan, log, architecture, ADR, dirty worktree)
- [ ] `npx tsx ai-memory.ts init --dry-run` reports what would be created without writing files
- [ ] `npx tsx ai-memory.ts init` scaffolds the full `docs/ai/` skeleton when missing
- [ ] `init` does not overwrite existing user-authored content
- [ ] No external memory framework, vector DB, or third-party API is introduced

**Risks:**
- Template content in init needs to match existing conventions — low risk, easy to adjust
- Edge cases with dirty worktree detection in close-check — moderate risk, test on clean/dirty states

### Phase 2: Workflow Integration

**Scope:**
- Update `base/opencode/agents/planner.md` to reference the `ai-memory` skill in the Memory Duties section and the Memory Freshness Check section
- Update `base/opencode/commands/close.md` to reference `ai-memory close-check` as companion evidence during closeout
- Update `base/opencode/commands/review-phase.md` to reference `ai-memory` for close-check during phase review
- Optionally update `base/opencode/commands/memory.md` routing guidance to mention `ai-memory` for deterministic operations vs routing judgment

**Acceptance criteria:**
- [ ] `planner.md` references `ai-memory` alongside `memory-maintenance` in memory duties
- [ ] `close.md` references running `ai-memory close-check` as part of closeout
- [ ] `review-phase.md` references `ai-memory` for close-check during phase review
- [ ] All references are concise and follow existing documentation style
- [ ] Existing progressive-disclosure rules remain intact

**Risks:**
- Minimal — documentation-only changes

## Validation Strategy

- Run the script with `--help` to verify subcommand registry
- Run each subcommand against the current `docs/ai/` structure and verify output
- Run `init --dry-run` to verify template output without modifying the repo
- Run `git status` to confirm no unintended changes
- Run `npx --yes -p typescript -p @types/node -- tsc --noEmit` for type-checking if project-configured

## Decisions To Record

- ADR: Broadened ADR-0017 to cover TypeScript as the main language for all tooling and skill scripts, absorbing the release migration and skill-script policy into a single consolidated decision
- ADR: Separate `ai-memory` (deterministic script operations) from `memory-maintenance` (routing/freshness judgment)
