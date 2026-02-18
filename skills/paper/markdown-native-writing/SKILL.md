---
name: markdown-native-writing
description: Draft scientific papers directly in Markdown with section-level structure and evidence-first claim flow.
user-invokable: true
license: MIT
metadata:
  domain: paper
  category: writing-core
  risk-level: low
argument-hint: "Provide draft path(s), target sections, venue constraints, and any required claims/figures/citations to include."
---

# Skill: Markdown-Native Scientific Writing

## Trigger (when to use)

Use this skill when authoring or revising a scientific paper directly in Markdown, before any format conversion.

## Inputs expected

- Draft path(s) (for example `paper/drafts/main.md` or per-section Markdown files).
- Target sections to write or revise (abstract, introduction, method, results, discussion, conclusion).
- Core contribution claims and evidence sources.
- Venue constraints (length limits, mandatory sections, tone expectations).
- Existing placeholder inventory and unresolved TODO items.

## Procedure

1. Confirm writing scope (new draft vs revision) and exact sections to touch.
2. Restate 1-3 core contributions in one sentence each.
3. Build or validate section skeleton in Markdown headings.
4. Draft each paragraph with claim → evidence → implication flow.
5. Keep one paragraph objective; remove mixed-purpose paragraphs.
6. Add citations as placeholders only: `[CITE: key-or-shortname]`.
7. Add cross-references as placeholders: `[REF: label]`.
8. Add figure/table placeholders only when needed: `[FIGURE: label — caption]`, `[TABLE: label — caption]`.
9. Remove or avoid Markdown emphasis markers in paper prose (`**...**`, `*...*`, `__...__`, `_..._`).
10. Normalise spelling and phrasing to British English across edited text.
11. Mark missing support explicitly with `[TODO: ...]` instead of inventing facts.
12. Align terminology and symbols across all edited sections.
13. Check section coherence:
    - Abstract states problem, method, key result, and impact.
    - Introduction defines gap and explicit contribution list.
    - Method is reproducible and scoped.
    - Results map claims to evidence and baselines.
    - Conclusion reflects only supported claims.
14. Run a compression pass for concision (remove filler and duplicate claims).
15. Produce a short revision summary with open citation/evidence gaps.

## Output template

- Objective:
  - <what was drafted/revised>
- Draft update:
  - <sections changed + brief summary>
- Evidence alignment:
  - <claim-to-evidence notes>
- Open citation gaps:
  - <missing refs as placeholders>
- Risks to acceptance:
  - <clarity/novelty/evidence risks>
- Next revision:
  - <concrete next edits>

## Common failure modes

- Writing polished prose before argument structure is sound.
- Mixing results interpretation with unsupported speculation.
- Inconsistent terminology across sections.
- Using visual emphasis markers instead of precise technical wording.
- Mixing British and American English within the same manuscript.
- Missing explicit novelty/gap sentence in introduction.
- Results section that reports numbers without interpretation.
- Conclusions that overclaim beyond evidence.
- Replacing missing evidence with invented statements.
