# ADR-0049: Experimental Plan-Completion Audit Workflow

**Status:** Accepted (experimental)

## Context

ADR-0048's `delivery` workflow independently verifies each task before it is accepted. Its bounded evidence and repair rules protect correctness, but per-task review can still add substantial iteration for plans whose tasks are small and locally verifiable.

We want to evaluate a separate workflow without weakening or replacing ADR-0048: a primary implementer completes an explicitly marked plan, validating and committing each task, then a primary auditor independently reviews the resulting commit range once.

## Decision

1. Add opt-in `implementer` and `auditor` primary agents and one generic read-only `scout` subagent. Existing `delivery`, `code`, `reviewer`, and `architect` roles remain unchanged.
2. An experimental plan declares `workflow: implement-then-audit` and keeps its progress in `Experimental status:` records. This state is deliberately distinct from ADR-0048's `Status:` acceptance state; legacy delivery commands must not execute an experimental-marked plan.
3. `implementer` completes all ready tasks, runs their agent-owned validation, commits validated work, and records an execution changelog. It owns active experimental-plan evolution: repository evidence may amend task direction, criteria, dependencies, and validations when recorded with rationale, evidence, affected tasks, and validation impact. Completion means local validation and commit, never independent acceptance.
4. `auditor` reviews the finished plan, implementation amendments, changelog, and commit range once. It may dispatch several bounded scout investigations with caller-provided lenses such as acceptance/regression, codebase, docs, ADR/architecture, security, or simplicity.
5. Scouts are caller-neutral, read-only, non-delegating evidence gatherers. They neither assess risk nor prescribe fixes. A single generic identity avoids premature specialization while retaining a compact handoff contract.
6. The auditor deduplicates evidence into high, medium, and low findings. High requires a demonstrated approved-criterion failure, applicable contract/ADR conflict, or material correctness, reliability, or security regression and requests change. Medium requests a clearly bounded in-scope correction only when justified; otherwise it is follow-up. Low is always follow-up.
7. Routine plan drift does not return to `planner`. `implementer` updates factual `docs/ai/**` memory as part of implementation; only an unresolved public-contract, persistence, auth/security, deployment, or user-visible scope decision pauses for a direct user decision.
8. Agent files state concise authority and output boundaries. `implementation-quality` and `review-triage` own the operational detail, preserving progressive disclosure.

## Consequences

- The experiment removes routine independent review from the task loop but retains one independent, evidence-backed audit over the final integration surface.
- Implementer commit authority is intentionally broader than the legacy `code` worker's authority, while auditor and scout remain read-only.
- A finding after completion can require follow-up work; this setup does not add automatic repair orchestration or a deterministic scheduler.
- Implementer-owned amendments keep the experiment moving, while the amendment record gives the final auditor an auditable replacement for planner round-trips.
- The experiment must be evaluated before it becomes a default or replaces any ADR-0048 gate. Retain, revise, or remove it based on observed completion time, audit high-risk escape rate, and rework caused by end-of-plan findings.

## Non-goals

- Replacing the delivery workflow or changing its acceptance/commit rules.
- Adding slash commands, a persistent task database, or a deterministic orchestrator.
- Creating separate scout agents for each review specialty before evidence shows that role-specific permissions or prompts are necessary.

## Related

- ADR-0048: Risk-Proportionate Delivery with Specialized Worker Roles.
- `base/opencode/agents/implementer.md`
- `base/opencode/agents/auditor.md`
- `base/opencode/agents/scout.md`
- `base/opencode/skills/implementation-quality/SKILL.md`
- `base/opencode/skills/review-triage/SKILL.md`
