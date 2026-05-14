# ADR-0007: Use GitHub Issues As Operational Shared Task Tracker

Date: 2026-05-14
Status: Accepted

## Context

Shared repository tasks were tracked in `docs/ai/backlog/tasks.jsonl`, which is durable and auditable but not ideal for concurrent team coordination (claiming, releasing, and closing work in real time).

## Decision

Use GitHub Issues as the operational source of truth for shared team tasks in this repository.

- `/newtask` creates GitHub Issues for normal shared tasks.
- `/tasks` manages shared task operations: `list`, `claim`, `release`, `close`.
- Status is tracked with labels (`status:to-do`, `status:doing`, `status:blocked`) plus assignee state.
- Duplicate-claim prevention is process-based: verify assignee and `status:doing`, then assign + label + comment before implementation.
- Each person/collaborator uses one responsible agent/session for GitHub Issue interactions in this repository.

`docs/ai/backlog/tasks.jsonl` remains durable local memory/backlog transition history, not the active shared operations tracker.

## Consequences

- Team coordination improves through native issue assignment, comments, and status labels.
- Task workflow docs and command contracts must stay aligned with GitHub Issues operations.
- Backlog JSONL continues to hold durable context and mitigation tracking when needed.

## Alternatives Considered

- Keep `tasks.jsonl` as the only shared tracker: rejected due to higher duplicate-work risk in concurrent collaboration.
- Introduce GitHub Projects immediately: rejected for now to keep the workflow minimal; labels are sufficient initially.
