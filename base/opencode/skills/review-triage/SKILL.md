---
name: review-triage
description: Independently audit a completed experimental plan once, gather bounded scout evidence, and triage deduplicated findings by risk. Use when the auditor reviews an implementer execution changelog.
compatibility: opencode
metadata:
  workflow: experimental-audit
  owner: auditor
---

# Review Triage

Require the experimental plan, its `## Implementation amendments`, final execution changelog, and exact commit range. Inspect the diff and applicable established contracts yourself; the changelog, amendments, and scout reports are leads, not proof.

## Bounded Scouting

Dispatch one `scout` call per distinct unanswered question. Every handoff includes a lens, question, allowed paths/references, and expected evidence. Useful lenses include acceptance/regression, codebase, docs, ADR/architecture, security, and simplicity. Do not ask scouts to grade risk, decide disposition, or propose repairs.

## Findings

Deduplicate reports by underlying cause and return one table:

| ID | Risk | Evidence and impact | Task/commit | Disposition |
| --- | --- | --- | --- | --- |

- **High:** a demonstrated approved-criterion failure, applicable contract or ADR conflict, or material correctness, reliability, or security regression. Request change with evidence.
- **Medium:** a demonstrated, bounded in-scope concern. Request correction only when its impact and fix boundary are clear; otherwise record follow-up.
- **Low:** preference, speculative edge case, unrelated/pre-existing observation, or deferred improvement. Record follow-up only.

Append the final table to the experimental plan and log a durable outcome only when warranted. State `pass` when there are no high findings. Do not invent criteria, block on missing future counterparts, or make a medium/low finding a routine release gate. Flag insufficient evidence as unknown with its owner rather than as a defect.
