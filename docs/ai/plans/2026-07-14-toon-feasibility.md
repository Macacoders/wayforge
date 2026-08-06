---
status: completed
created: 2026-07-14
phase: 2/2
required_gates:
  architect_review: false
  memory_update: true
  test_verdict: false
---

# Issue #86: Investigate TOON as a JSON alternative

## Goal

Research whether TOON (Token-Oriented Object Notation) can replace JSON/JSONC in ai-config, covering both internal files and upstream runtime constraints, and produce a feasibility report with actionable recommendations.

## Questions

Resolved during Discovery:
1. Motivation = token savings + TOON standard adoption
2. Scope = internal files AND upstream constraint evaluation
3. Deliverable location = `docs/ai/reports/` (new directory)

## Assumptions

- `package.json`, `package-lock.json`, `tsconfig.json` are immediately classified as **must stay JSON** — no investigation needed.
- OpenCode/Kilo Code runtimes are external dependencies we cannot modify.
- The 10 JSONC fragment files and `installed-projects.json` are the primary candidates for investigation.
- The TS CLI is the current primary installer; legacy Bash/PowerShell are still in scope for assessment.
- The TOON TypeScript SDK (`@toon-format/toon`) and CLI (`@toon-format/cli`) exist and are functional for evaluation.

## Scope Classification

Size: **single-phase**
Phase budget: **2**
Phase budget rationale: Two phases — investigation (analysis across all file categories + upstream constraints) and report writing (structured deliverable). The separation is justified because investigation findings inform the report structure, and the report is the sole deliverable.
Quick delivery eligible: **No** — research task with multiple investigation dimensions and a structured document output.
Split required: **No**

## Phases

### Phase 1: Investigation and Analysis

Scope: Complete the file inventory classification, evaluate upstream runtime constraints, assess installer impact, and evaluate TOON tooling feasibility.

Acceptance criteria:
- [ ] All 20 JSON/JSONC files classified as: **must stay JSON**, **could migrate to TOON**, or **needs further investigation**
- [ ] Upstream constraint answered: Does OpenCode/Kilo Code natively support TOON? (Check docs, GitHub issues, runtime behavior)
- [ ] Each migratable file category assessed for installer impact (TS CLI, legacy Bash, legacy PowerShell)
- [ ] External tool dependencies evaluated (`jq`, `gh`, `npm`, OpenCode runtime)
- [ ] TOON tooling evaluated: SDK availability, round-trip reliability, parsing overhead
- [ ] Estimated effort level for each migration category
- [ ] Findings documented in a structured analysis file (intermediate working document)

Risks:
- Upstream OpenCode runtime may not document format support clearly — may require runtime testing or GitHub issue inquiry
- TOON tooling may have limited documentation or breaking changes

### Phase 2: Feasibility Report

Scope: Synthesize Phase 1 findings into a structured report at `docs/ai/reports/toon-feasibility-2026-07-14.md` with clear recommendations.

Acceptance criteria:
- [ ] Report created at `docs/ai/reports/toon-feasibility-2026-07-14.md`
- [ ] Report contains: executive summary, file inventory table, upstream constraint analysis, installer impact assessment, TOON tooling evaluation, effort estimates, and feasibility recommendation
- [ ] Recommendation is one of: **adopt**, **adopt partially**, or **do not adopt** — with clear rationale
- [ ] If adopt/partially: suggested first steps and estimated effort outlined
- [ ] ADR created at `docs/ai/decisions/` if the recommendation involves a durable architectural decision
- [ ] `docs/ai/README.md` updated if `reports/` directory is added

Risks:
- Report may be lengthy if all categories warrant detailed analysis — mitigated by using tables and executive summary
- ADR may be premature if recommendation is "needs further investigation"

## Validation Strategy

- Review report structure against acceptance criteria
- Verify file inventory completeness (all 20 files accounted for)
- Confirm upstream constraint answer is supported by evidence (not speculation)
- Check that effort estimates are grounded in actual code paths identified during investigation

## Decisions To Record

1. **Report location**: `docs/ai/reports/` as the convention for research deliverables (if approved, this becomes a standing convention)
2. **Feasibility recommendation**: The core decision — adopt/partially/don't adopt TOON — to be recorded as an ADR if durable

## Issue

- GitHub: #86
- Assignee: PKCPablo
- Status: doing
