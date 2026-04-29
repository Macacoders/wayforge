# ADR-0003: Add Research Agent For Repository Onboarding

Date: 2026-04-29
Status: Accepted

## Context

The staged delivery workflow needs reliable project memory before planning work in existing repositories. Without an onboarding step, `plan` would either rediscover the repository repeatedly or load too much context before asking useful questions.

## Decision

Add `research` as a read-oriented OpenCode subagent for repository onboarding.

`research` inspects documentation, structure, stack, scripts, tests, CI/CD, entrypoints, conventions, and risks. It creates or proposes initial `docs/ai/` memory before feature, bugfix, or refactor planning starts.

## Consequences

- Repository onboarding is separated from implementation planning.
- `plan` can stay compact and use a Repository Research Brief.
- Existing repositories can gain a durable `docs/ai/` wiki before coding work begins.
- `research` may edit memory with approval, but must not modify product code.

## Alternatives Considered

- Make `plan` do all onboarding directly: rejected because it pollutes planning context and weakens separation of responsibilities.
- Keep onboarding read-only and require another agent to write memory: rejected for now because `edit: ask` plus prompt constraints gives a practical balance.
