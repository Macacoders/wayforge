---
name: latex-lint
description: Lint and hygiene check for LaTeX and Markdown paper manuscripts.
metadata:
  domain: paper
  category: lint
---

# Metadata
# Constraints
- [ ] No bold/italic markers in prose (except titles)
- [ ] No British/American spelling mix
- [ ] No non-technical adjectives
- [ ] No citation/reference formatting gaps

# Procedure
- [ ] **Linting**
  - [ ] Run `chktex` or `lacheck` on LaTeX files
  - [ ] Search for bold/italic markers: `grep -E '\*\*|\*\|_|__' *.md`
  - [ ] Check spellings (British English)
- [ ] **Cleanup**
  - [ ] Remove double spaces; normalize whitespace
  - [ ] Unify terminology and notation
  - [ ] Check citation placement and style
- [ ] **Validation**
  - [ ] Review LaTeX warnings and log files
  - [ ] Ensure metadata (authors, abstract) alignment
  - [ ] confirm title consistency
- [ ] **Finalize**
  - [ ] Highlight remaining TODOs/gaps
  - [ ] Confirm compliance with venue template
