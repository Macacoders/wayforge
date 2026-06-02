---
name: graphify-memory
description: Use ONLY for explicit Graphify requests ("/graphify", graph memory extraction) to prepare optional local graph output without replacing curated docs/ai memory.
compatibility: opencode
metadata:
  workflow: graphify-optional
---

# Graphify Memory (Optional)

Use this skill only when the user explicitly asks for Graphify workflows (for example `/graphify`).

## Core Policy

- Treat Graphify as optional. Do not make it a default dependency or default installer behavior.
- Keep curated memory authoritative: `docs/ai/**`, `README.md`, and `AGENTS.md` remain the source of truth.
- Use Graphify output as supplemental context, not a replacement for curated repository documentation.

## Tooling Names

- Python package name: `graphifyy`
- CLI command name: `graphify`

## Data Handling

- Code extraction is local.
- Documentation, PDF, and image processing may involve model API calls depending on user options.
- Generated output can include noisy, derived, or sensitive context; treat it as local working data unless explicitly curated.

## Repository Hygiene

- Do not commit generated Graphify artifacts by default (especially `graphify-out/**`).
- Do not copy generated Graphify output into curated `docs/ai/**` unless a human intentionally curates and approves the content.

## Execution Expectations

- Keep operations inside the active repository root unless the user explicitly approves an external path.
- Keep changes minimal and operational; avoid broad workflow rewrites.
