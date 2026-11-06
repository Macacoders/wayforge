---
name: memory-maintenance
description: Keep docs/ai memory current with low-token routing and freshness checks.
compatibility: opencode
metadata:
  workflow: memory
  owner: planner
---

# Memory Maintenance

Use this skill to keep `docs/ai/**` useful, compact, and current without loading large memory surfaces by default.

## Routing Model

- Treat `docs/ai/README.md` as the memory router.
- Load only the smallest file(s) needed for the active question.
- Never load all memory files by default.

## Freshness Rules

Run a concise freshness check at review:

1. Is the active plan status current? Treat `status: in-progress` with no recent `task:` bump in the YAML frontmatter as a stale signal.
2. Did boundaries/invariants change? If yes, update `architecture.md`.
3. Was a durable decision made? If yes, add/update an ADR.
4. Is a short monthly log entry needed?
5. Are stale or duplicate notes being proposed? If yes, avoid persisting them.

## What To Update

- `plans/` for approved plan progress and task status
- `architecture.md` for durable boundary/invariant changes
- `decisions/` for durable, future-impacting choices
- `logs/` for concise monthly continuity notes

## What Not To Persist

- Full transcripts
- Raw diffs
- Long terminal output
- Temporary implementation scratch notes
- Information already captured clearly elsewhere

## Ownership And Reporting

- `planner` is final memory owner and decides persistence.
- `code` and `research` may propose updates, but keep proposals short.
- Report memory actions as: files touched, why, and any freshness gaps deferred.
