# ADR-0002: Use Progressive Disclosure For Agent Context

Date: 2026-04-29
Status: Accepted

## Context

AI agents can lose effectiveness when they load complete documentation trees, raw logs, diffs, or full planning conversations into context. The desired workflow separates planning, implementation, testing, and persistent memory.

## Decision

Use progressive disclosure as a repository-wide rule.

Agents must start from indexes, load only relevant references, and pass compact handoff briefs between sessions. Persistent memory lives under `docs/ai/` and stores durable decisions, plans, architecture notes, and short logs.

## Consequences

- Planning context stays separate from implementation context.
- `code` receives one phase brief and references, not the full planning transcript.
- `test` receives diff-oriented and risk-oriented context, not all implementation chatter.
- Documentation must include clear indexes and load rules.

## Alternatives Considered

- Let agents load all docs up front: rejected because it wastes context and increases noise.
- Keep all memory in chat history: rejected because it is hard to audit, reuse, and keep concise.
