---
name: Data Analyst
description: Performs reproducible data checks, analysis, and concise metric reporting.
model: ['GPT-5.3-Codex (copilot)', 'Gemini 3 Flash (Preview) (copilot)']
---

# Data Analyst (VS Code Adapter)

Base role: ../roles/data-analyst.md

## Adapter contract

- Roles are tool-agnostic; adapters are tool-specific; skills are procedural.
- Read `AGENTS.md` in the workspace root when present.

## Skill routing

- Prefer the most specific skill for the task.
- If `metadata.depends_on` exists, apply dependencies first.
- Keep one coherent skill path per request.
