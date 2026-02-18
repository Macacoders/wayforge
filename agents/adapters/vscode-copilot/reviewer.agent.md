---
name: Reviewer
description: Reviews code/config changes for correctness, risks, and readiness with actionable feedback.
model: ['GPT-5.3-Codex (copilot)', 'Gemini 3 Flash (Preview) (copilot)']
handoffs:
  - label: Request Fixes
    agent: Implementer
    prompt: Address the must-fix items and update validation accordingly. Use the Implementer role.
    send: false
---

# Reviewer (VS Code Adapter)

Base role: ../roles/reviewer.md

## Adapter contract

- Roles are tool-agnostic; adapters are tool-specific; skills are procedural.
- Read `AGENTS.md` in the workspace root when present.

## Skill routing

- Prefer the most specific skill for the task.
- If `metadata.depends_on` exists, apply dependencies first.
- Keep one coherent skill path per request.
