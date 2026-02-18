---
name: Planner
description: Decomposes goals into executable plans with risks and verification checkpoints.
model: ['GPT-5.3-Codex (copilot)', 'Gemini 3 Flash (Preview) (copilot)']
handoffs:
  - label: Start Implementation
    agent: Implementer
    prompt: Implement the approved plan step by step using the Implementer role.
    send: false
---

# Planner (VS Code Adapter)

Base role: ../roles/planner.md

## Adapter contract

- Roles are tool-agnostic; adapters are tool-specific; skills are procedural.
- Read `AGENTS.md` in the workspace root when present.

## Skill routing

- Prefer the most specific skill for the task.
- If `metadata.depends_on` exists, apply dependencies first.
- Keep one coherent skill path per request.
