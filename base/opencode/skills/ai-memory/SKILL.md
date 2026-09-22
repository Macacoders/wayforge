---
name: ai-memory
description: Deterministic docs/ai bookkeeping: status, list-plans, list-adrs, close-check, and init scaffold.
compatibility: opencode
metadata:
  workflow: memory
---

# AI Memory Bookkeeping

Use this skill for deterministic `docs/ai/**` bookkeeping — listing plans/ADRs, checking closeout status, and scaffolding missing skeleton files. For routing and freshness judgment (what to load, what to update), use `memory-maintenance` instead.

## Subcommands

All subcommands are provided by `scripts/ai-memory.ts`:

```
npx tsx scripts/ai-memory.ts status [--json]
npx tsx scripts/ai-memory.ts list-plans
npx tsx scripts/ai-memory.ts list-adrs
npx tsx scripts/ai-memory.ts close-check
npx tsx scripts/ai-memory.ts init [--dry-run]
```

- `status` — report whether `docs/ai/` exists and summarize key memory files/directories. With `--json`, outputs structured JSON.
- `list-plans` — list plan files with filename, first heading, and status line.
- `list-adrs` — list ADR files with title and number.
- `close-check` — report closeout checklist: active plan candidates, monthly log, architecture/ADR considerations, dirty worktree.
- `init` — scaffold missing `docs/ai/` skeleton from embedded templates. Use `--dry-run` to preview without writing.

## Guidance

- The script runs from any repository root (the skill's own repo or a consumer repo). It uses `process.cwd()` as the working directory.
- All operations stay inside the repository root.
- `init` never overwrites existing user-authored content.
- Use `close-check` as evidence during task closeout or review.
- For memory routing and freshness decisions, load `memory-maintenance` instead.
