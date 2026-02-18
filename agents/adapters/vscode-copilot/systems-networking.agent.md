---
name: Systems Networking
description: Diagnoses and improves systems and network behavior using scoped, reversible operations.
model: ['GPT-5.3-Codex (copilot)', 'Gemini 3 Flash (Preview) (copilot)']
---

# Systems Networking (VS Code Adapter)

Base role: ../roles/systems-networking.md

## Adapter contract

- Roles are tool-agnostic; adapters are tool-specific; skills are procedural.
- Read `AGENTS.md` in the workspace root when present.

## Skill routing

- Prefer the most specific skill for the task.
- If `metadata.depends_on` exists, apply dependencies first.
- Keep one coherent skill path per request.
