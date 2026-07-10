---
status: planned
created: 2026-07-10
phase: 0/1
required_gates:
  test_verdict: false
  memory_update: true
---

# Issue #61 — Analyze and design language-aware test coverage agent or skill

## Goal

Design a language-aware test coverage skill for the OpenCode/Kilo Code ecosystem that can detect project languages, run coverage tools, negotiate thresholds, and suggest improvements - **reusable across any language**.

## Questions

| # | Question | Answer |
|---|----------|--------|
| Q1 | Design approach? | **Create a new skill** — keeps test subagent focused on review, aligns with existing skill ecosystem, composable with other agents. |
| Q2 | Workflow integration? | **Consider staged-delivery workflow** — test subagent is already part of staged-delivery; design how coverage skill integrates. |
| Q3 | Output scope? | **Documentation only** — feasibility report, design document, ADR draft. No prototype code. |
| Q4 | Multi-language projects? | **Analyze each language separately** — not combined coverage. |
| Q5 | Coverage report parsing? | **Open question** for future resolution. |
| Q6 | Custom thresholds? | **Yes** — on-boarding should ask for custom threshold if user wants to override default 80%. |
| Q7 | Missing coverage tools? | **Stay silent** — no errors, no suggestions if tools aren't installed or handled. |
| Q8 | Coverage scope? | **Changed files by default**, full coverage only when prompted. |

## Assumptions

- This is a design/planning task, not an implementation task.
- Output is documentation only - no prototype code.
- Scope is limited to analysis and design for the OpenCode/Kilo Code ecosystem.
- Design should consider the existing `test` subagent and staged-delivery workflow.
- Design should be **reusable across any language** (not just Python, Go, Java, TypeScript/JavaScript).
- Multi-language projects: analyze each language **separately**.
- Coverage report parsing: **open question** for future resolution.
- Thresholds: on-boarding should ask for **custom threshold if wanted**.
- Error handling: if coverage tools aren't installed or handled, **stay silent**.
- Scope: analyze coverage for **changed files by default**, full coverage only when prompted.

## Scope Classification

| Field | Value |
|-------|-------|
| **Size** | Single-phase (documentation deliverable) |
| **Phase budget** | **1 phase** |
| **Phase budget rationale** | All acceptance criteria can be addressed in a single documentation effort - research, design, and ADR draft are interconnected and don't require separate implementation phases. |
| **Quick delivery eligible** | No — requires research and design thinking, not just small code changes. |
| **Split required** | No — the deliverables are tightly coupled. |

## Phase 1: Research, Design, and ADR Draft

### Scope

Create comprehensive documentation package including feasibility report, design comparison, and ADR draft.

### Acceptance criteria

- [ ] Research and document standard, zero-dependency, or highly portable test-running and coverage tools for **common languages (with extensibility for others)**
- [ ] Outline trade-offs between implementing this capability as a standalone agent, reusable skill, or expansion of the existing `test` subagent
- [ ] Define the interaction protocol for user-agent negotiation to override or accept the default 80% coverage threshold
- [ ] Design the discovery process for automatically detecting project languages and identifying current test suite locations
- [ ] Define safe-execution guidelines for running tests locally, including how to avoid unsafe dependency installation, network access, secret exposure, or destructive commands
- [ ] Define how the capability should propose improvements after coverage gaps are found, including whether it only recommends tests or may draft tests after explicit approval
- [ ] Provide a concrete proposal or ADR draft recommending the best approach
- [ ] Design language detection that identifies **all languages in a project** and analyzes each separately
- [ ] Define behavior when coverage tools are missing: **stay silent** (no errors, no suggestions)
- [ ] Design on-boarding interaction to **ask for custom threshold** if user wants to override default
- [ ] Design **incremental coverage** mode (changed files only) as default, with full coverage as opt-in

### Risks

| Risk | Mitigation |
|------|------------|
| Scope creep into implementation | Keep deliverables as documentation only; clearly mark future implementation work. |
| Coverage tool diversity | Focus on common, zero-dependency tools; document extensibility mechanism for adding new languages. |
| Integration complexity with existing workflow | Design as composable skill that can be invoked independently or as part of staged-delivery. |

## Validation Strategy

| Check | How |
|-------|-----|
| Completeness | Review documentation against all 11 acceptance criteria |
| Consistency | Verify design decisions align with existing workflow (test subagent, staged-delivery) |
| Clarity | Ensure ADR draft provides clear recommendation with trade-offs |

## Decisions To Record

| Decision | Value |
|----------|-------|
| Approach choice | Skill (not agent or extension) |
| Language coverage strategy | Language-agnostic with extensibility mechanism |
| Language extensibility | How new languages can be added |
| Integration with existing workflow | Composable skill for staged-delivery or standalone |
| Safe execution guidelines | Avoid unsafe dependency installation, network access, secret exposure, destructive commands |
| Improvement proposal approach | Recommend tests vs draft tests (with explicit approval) |
| Multi-language handling | Analyze each language separately |
| Silent failure behavior | Stay silent when coverage tools missing |
| Default incremental vs full coverage | Changed files by default, full coverage opt-in |
| Coverage report parsing | Open question for future |
| Threshold customization | On-boarding asks for custom threshold if wanted |