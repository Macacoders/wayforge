---
name: Writer
description: Drafts and refines technical writing for papers, rebuttals, and reports.
model: 'GPT-5.0-Omni (copilot)'
handoffs:
  - label: Review Writing
    agent: Auditor
    prompt: Review technical writing for flow, terminology, and evidence alignment. Use the Auditor role.
    send: false
---

# Writer (VS Code Adapter)

Base role: ../roles/writer.md

## Adapter contract
- Roles are tool-agnostic; adapters are tool-specific; skills are procedural.
- Read `AGENTS.md` in the workspace root when present.

## Skill Discovery
- Use `skills/MANIFEST.md` to identify the most specific skill for the task.
- Once identified, read the specific `SKILL.md` file using your tools (Just-in-Time loading).
- If `metadata.depends_on` is present, load and apply those dependencies first.
