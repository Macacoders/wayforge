---
name: markdown-to-latex
description: Optional downstream mapping from finalized Markdown drafts into a provided LaTeX template and section files (formatting-only).
user-invokable: true
license: MIT
metadata:
  domain: paper
  category: formatting
  risk-level: low
argument-hint: "Provide the Markdown file path(s), target LaTeX file path(s), and any mapping rules (section level, citation placeholder format, figure/table labels)."
---

# Skill: Markdown to LaTeX

## Trigger (when to use)

Use this skill only after Markdown drafting is complete and a LaTeX output is required using the repository's provided LaTeX template/section structure.

## Inputs expected

- Source Markdown file(s) (ideally under `paper/drafts/`).
- Existing LaTeX project scaffold (for example `paper/latex/main.tex` + `paper/latex/sections/*.tex`).
- Section mapping from Markdown files/headings to existing LaTeX section files.
- Placeholder conventions already used by the Markdown drafting workflow.
- Any repo-specific LaTeX conventions (macros, labels, environments).

## Procedure

1. Confirm this is a formatting-only mapping task (no content rewriting).
2. Confirm repository policy: use provided LaTeX template/sections; do not run pandoc or other full-document converters.
3. Read the existing `main.tex` include structure and target section files.
4. Build explicit mapping from Markdown sections/files to those existing `.tex` section files.
5. Update only mapped section files; do not replace template files or class/style configuration.
6. Convert placeholders consistently:
   - `[CITE: key]` → `\\cite{key}`
   - `[REF: label]` → `\\ref{label}`
   - `[TODO: ...]` → repo-approved TODO form (default `TODO: ...` text if no macro exists).
7. Keep manuscript emphasis policy: do not introduce `\\textbf{}`/`\\textit{}` for narrative emphasis.
8. Handle figures/tables conservatively in-place using repository conventions; if unknown, insert minimal stubs and TODO notes without fabricating content.
9. Escape LaTeX special characters in plain text where required (`# $ % & _ { } ~ ^ \\`) and avoid changing confirmed math blocks.
10. Preserve paragraph boundaries and section ordering from Markdown unless mapping requires a different target file split.
11. Keep diffs minimal: do not reformat unrelated LaTeX or modify bibliography/style assets.
12. Provide compile instruction for maintainers (for example `compile main.tex`) and only patch syntax-level issues introduced by this mapping when requested.

## Output template

- Sources:
  - <md paths>
- Template:
  - <main.tex path>
- Targets:
  - <section .tex paths>
- Section mapping used:
  - <md section/file -> tex section file>
- Conversion notes:
  - <any ambiguous cases, manual follow-ups>
- Safety:
  - <what was left unchanged / TODO>

## Common failure modes

- Rewriting content while converting (scope violation).
- Running pandoc (or equivalent) and bypassing the repository template/section structure.
- Replacing `main.tex` or class/style files instead of updating only target sections.
- Introducing new LaTeX packages/macros without project consent.
- Breaking citations by guessing bibkeys.
- Incorrect escaping causing compile errors.
- Converting placeholders inconsistently (REF/CITE label drift).
- Inventing figure/table contents instead of leaving stubs.
