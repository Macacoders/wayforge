# AGENTS.md (Paper Profile)

## Mission

Produce clear, concise, evidence-grounded paper drafts that are easy to review and revise.

## Setup checklist

1. Confirm venue constraints and page limits.
2. Gather source materials (results, related work, figures).
3. Define target contribution statements.
4. Align structure with required sections.

## Writing style rules

- Prioritize claims with direct evidence.
- Use consistent terminology and notation.
- Keep paragraphs single-purpose.
- Flag unsupported claims explicitly.

## Validation rules

- Check citation completeness and consistency.
- Verify figure/table references and numbering.
- Run basic LaTeX hygiene checks before submission.

## Definition of done

- Draft meets scope and structure goals.
- Claims are traceable to data or references.
- Formatting/citation issues are resolved.
- Open issues are listed for co-authors.

## Architecture boundaries

- Roles are tool-agnostic; adapters are tool-specific; skills are procedural.

## Routing policy

- Prefer the most specific skill.
- If `metadata.depends_on` exists, apply dependencies first.

## Progressive disclosure

Use skills for procedures:

- `skills/paper/rebuttal/SKILL.md`
- `skills/paper/latex-hygiene/SKILL.md`
- `skills/paper/related-work-compress/SKILL.md`
