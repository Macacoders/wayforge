---
name: create-skill
description: Create or update OpenCode skills with correct frontmatter, trigger-focused descriptions, and concise operational guidance. Use when the user asks to create, scaffold, rename, or improve a SKILL.md-based skill.
compatibility: opencode
metadata:
  workflow: authoring
---

# Create Skill

Use this skill to design a new skill folder or improve an existing one.

## Workflow

1. Confirm scope and triggers.
   - What problem should the skill solve?
   - What user phrases should trigger loading?
   - Are scripts or extra reference files needed?
2. Draft or update `SKILL.md`.
   - Keep instructions concise and executable.
   - Keep description specific: capability + `Use when ...` triggers.
3. Add optional files only when needed.
   - `REFERENCE.md` for infrequent deep detail.
   - `scripts/` for deterministic, repeatable operations.
4. Validate with the user.
   - Confirm intended triggers, scope, and clarity.

## Structure

```text
skill-name/
├── SKILL.md
├── REFERENCE.md   (optional)
└── scripts/       (optional)
```

## Quality Checklist

- [ ] Frontmatter `name` matches the skill folder name.
- [ ] Description clearly states capability and trigger conditions.
- [ ] Guidance is concise and avoids unnecessary theory.
- [ ] Extra files/scripts are included only when they add clear value.
