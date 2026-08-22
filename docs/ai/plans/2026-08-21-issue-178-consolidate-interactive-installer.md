---
status: completed
created: 2026-08-21
phase: 2/2
required_gates:
  test_verdict: false
  architect_review: false
  memory_update: true
---

# Issue #178: Consolidate interactive installer into `ai-config interactive`

## Goal

Make the TypeScript CLI's `ai-config interactive` command the single guided installation path: improve its UX (provider hints before selection, model-preset context, clearer summary), directly eliminate the duplicated shell interactive wrappers (`install/bootstrap-interactive.sh` / `.ps1`, ~540 lines), and align tests/docs/memory. Non-interactive `bootstrap.sh`/`.ps1` are untouched.

## Scope Classification

- **Size**: Medium-small (~540 lines deleted; ~60–80 TS lines modified; ~30 doc lines)
- **Phase budget**: 2
- **Phase budget rationale**: Safety ordering — verify the improved canonical flow before removing alternatives; docs/test cleanup rides with removal. One phase would mix unverified-new-path with deletion; three would fragment small work.
- **Quick delivery eligible**: No — multi-surface (TS + Bash tests + docs + memory); staged review elected.
- **Split required**: No
- **Architect review**: Not required — no architecture-boundary change; duplicated surface removed, CLI prompt-layer UX only.

## Confirmed Decisions

1. **Eliminate, don't deprecate** — both interactive shell wrappers are deleted directly in this change; no deprecation window. Owner decision overrides the issue body's "keep functional for one release cycle" wording (to be recorded as an issue comment).
2. **Stay minimal** — no environment prerequisite checks added to `ai-config interactive`.
3. **Plain-text output** — no formatting dependency (`chalk` etc.), consistent with #131 zero-dep policy.
4. README stale agent-preset text (lines ~153, `balanced/fast/thorough` removed since #70) is fixed as part of docs work.
5. No formal ADR — decisions recorded via this plan, issue #178 comment, and monthly log.

## Phase 1: Enhance `ai-config interactive` UX

**Scope** (`cli/src/commands/interactive.ts` only):

1. Provider menu: per-option hint lines displayed *before* selection (free-tier = nothing required; openai / github-copilot = `/connect` auth in OpenCode/Kilo Code; laberit = `OPENAI_BASE_URL`/`OPENAI_API_KEY` env vars). Extend the data-driven `promptMenu` choice objects with hint fields rather than adding new prompt machinery.
2. Model-preset step: plain-language context on each preset (installer defaults vs faster responses, which models resolve).
3. Summary block: clearer formatting; show resolved model/small-model overrides when fast preset chosen.
4. Plain text only; zero new dependencies; no env prerequisite checks.

**Acceptance criteria**:

- [ ] Provider selection shows what each option requires before choosing.
- [ ] Model-preset step explains implications in plain language.
- [ ] Summary clearly presents resolved models when fast preset is chosen.
- [ ] Piped-input smoke run completes a dry-run install end-to-end against a temp repo.
- [ ] `npx vitest run` + typecheck pass.

**Risks**:

- stdin-driven command has no automated unit harness → mitigated by piped smoke validation.
- Prompt-wording churn kept minimal; no behavioral change to `doInstall` inputs.

## Phase 2: Eliminate shell interactive wrappers + docs/memory alignment

**Scope**:

1. Delete `install/bootstrap-interactive.sh` and `install/bootstrap-interactive.ps1`.
2. Delete `tests/bash/bootstrap_interactive.bats` (all 4 tests exercise only the deleted Bash wrapper; `qa/check-bats` discovers by glob — no Makefile change).
3. Rewrite README "Interactive install" section → `ai-config interactive` as primary path; remove stale agent-preset text.
4. Update `docs/ai/architecture.md` line 10 → interactive installs are TS CLI only.
5. Comment on issue #178 recording the direct-elimination decision (via repo gh-issue helper, `npx tsx`).

**Acceptance criteria**:

- [ ] Both wrapper scripts and their bats file gone; full-repo grep shows zero live references outside historical plans/logs.
- [ ] `make check` passes (remaining Bats suite green; duplication metric unaffected or improved).
- [ ] README recommends `ai-config interactive`; stale preset text gone.
- [ ] `architecture.md` reflects TS-only interactive install.
- [ ] Issue #178 updated with the owner decision comment.
- [ ] Plan frontmatter advanced (`phase`, then `status: completed`) and monthly log entry written at close.

**Risks**:

- Hidden consumer references — ruled out pre-plan by full-repo grep + Makefile/CI verification (no references outside README, bats file, wrappers themselves, `architecture.md` line 10, historical plans/logs).
- Users on older clones lose the wrapper — accepted per owner decision.

## Validation Strategy

- **Gate**: `make check` (typecheck, lint, format, vitest, jscpd, shfmt/shellcheck, PSScriptAnalyzer/Pester) plus `npx vitest run`.
- **Smoke (manual, both phases)**: pipe scripted answers into `npx tsx cli/src/index.ts interactive` → dry-run install succeeds against a temp repo.
- **No new automated tests**: changed code is stdin-driven presentation logic; underlying `doInstall` already covered; existing Bats coverage tested exactly the script being deleted. Optional future hardening (requires explicit approval): extract provider-choice/hint table into `lib/providers.ts` for one pure unit test file.

## Decisions To Record

1. Direct elimination over deprecation window for interactive shell wrappers (owner decision, overrides issue text) → plan + issue #178 comment + monthly log.
2. `ai-config interactive` is the canonical guided installer → recorded in `architecture.md` (Phase 2).
3. Minimal UX: no env prerequisite checks; plain-text output; zero new dependencies → consistent with #131 zero-dep policy; recorded in this plan.
