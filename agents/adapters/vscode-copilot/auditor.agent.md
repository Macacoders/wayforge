---
name: Auditor
description: Reviews changes for correctness, risks, and readiness with actionable feedback.
model: 'GPT-5.0-Omni (copilot)'
handoffs:
  - label: Request Fixes
    agent: Engineer
    prompt: Address the must-fix items and update validation accordingly. Use the Engineer role.
    send: false
---

# Auditor (VS Code Adapter)

Base role: ../roles/auditor.md

## Adapter contract
- Roles are tool-agnostic; adapters are tool-specific; skills are procedural.
- Read `AGENTS.md` in the workspace root when present.

## Skill Discovery
- Use `skills/MANIFEST.md` to identify the most specific skill for the task.
- Once identified, read the specific `SKILL.md` file using your tools (Just-in-Time loading).
- If `metadata.depends_on` is present, load and apply those dependencies first.
