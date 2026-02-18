---
name: latex-hygiene
description: Run a repeatable LaTeX quality pass to fix build, citation, and formatting issues before review or submission.
user-invokable: true
license: MIT
metadata:
  domain: paper
  category: writing-quality
  risk-level: low
---

# Skill: LaTeX Hygiene

## Trigger (when to use)

Use this skill before internal draft circulation or submission to reduce formatting, citation, and build instability issues in LaTeX projects.

## Inputs expected

- LaTeX source tree (`.tex`, `.bib`, figures, style files).
- Build command used by team or venue template.
- Venue formatting constraints and class file requirements.
- Known warnings from recent builds.

## Procedure

1. Confirm canonical build command and output artifact.
2. Run clean build from scratch; capture warnings and errors.
3. Group warnings: references, citations, overfull boxes, package conflicts.
4. Fix hard errors first, then high-impact warnings.
5. Ensure all citations resolve and keys exist in bibliography.
6. Remove unused bibliography entries if policy requires.
7. Verify figure paths, formats, and resolution assumptions.
8. Normalize label naming style for sections, figures, tables, equations.
9. Check duplicate labels and broken `\ref` targets.
10. Ensure table and figure captions are complete and consistent.
11. Minimize manual spacing commands that hide layout issues.
12. Resolve overfull/underfull boxes by text edits first, not hacks.
13. Confirm math notation consistency across sections.
14. Validate acronym usage (define once, reuse consistently).
15. Verify appendices and supplementary references build correctly.
16. Confirm bibliography style matches venue requirements.
17. Re-run build until warning profile stabilizes.
18. Produce a short hygiene report with unresolved non-blockers.
19. Verify generated PDF metadata (title/authors) is correct.
20. Check that hyperlinks/bookmarks render correctly in PDF viewers.

## Output template

- Build status: pass | fail
- Error fixes applied:
  - <item>
- Warning fixes applied:
  - <item>
- Remaining warnings (non-blocking):
  - <item + reason>
- Submission risk: low | medium | high
- Follow-up actions:
  - <item>

## Common failure modes

- Editing content to satisfy formatting without preserving meaning.
- Suppressing warnings instead of fixing root causes.
- Breaking references while renaming labels.
- Inconsistent bibliography style across files.
- Figure format mismatches discovered only at camera-ready stage.
- Excessive manual spacing commands causing fragile layouts.
- Ignoring package/class incompatibilities.
- Not documenting unresolved warnings and impact.
- Broken PDF metadata or bookmarks discovered after submission upload.
- Appendix or supplementary references not included in final build.
