# ADR-0023: Enforce Discovery checkpoint before Plan Proposal

## Status
Accepted — amended by ADR-0048: the checkpoint still governs planning, but `direct`-path
work no longer enters planning and therefore never reaches it.

## Date
2026-07-07

## Context

ADR-0002 established progressive disclosure as a repository-wide rule: agents must start from
indexes, load only relevant references, and pass compact handoff briefs. However, the planning
workflow had no enforced checkpoint between understanding the request (discovery) and producing
a phased plan. The planner's Planning Output was a single monolithic template that mixed goal,
questions, assumptions, scope classification, phases, and validation strategy into one block.

In practice, this meant "ask before you build" was aspirational, not mandatory. Models could
collapse discovery and plan proposal into one output, defeating progressive disclosure at the
planning stage.

## Decision

Split the planner's Planning Output into two separate blocks with a mandatory confirmation gate:

1. **`## Discovery`** (must be confirmed before planning) — restate the goal, report lightweight
   research, ask at most three clarifying questions, list key assumptions. Wait for explicit user
   confirmation.
2. **`## Plan Proposal`** (only after Discovery confirmation) — scope classification, phased plan
   with acceptance criteria, validation strategy, decisions to record.

A hard Core Rule enforces the checkpoint:
> Present Discovery first and wait for explicit user confirmation before producing a Plan
> Proposal. Discovery and Plan Proposal are separate outputs; never collapse them into one message.

The `commands/plan.md` command wording was updated to describe the two-step flow.

Additionally, Phase Economy in `staged-delivery/SKILL.md` now prefers vertical slices (working
end-to-end features) over horizontal layers, with horizontal splits requiring explicit
justification.

## Consequences

- Planner can no longer skip discovery and jump directly to a plan proposal.
- Users must explicitly confirm their understanding before planner invests context in phase design.
- Extends ADR-0002's progressive disclosure principle into the planning workflow itself.

## Related

- Issue #160
- ADR-0002: Use progressive disclosure for agent context
- ADR-0020: Split planner into planner + delivery (planner owns Discovery checkpoint)
