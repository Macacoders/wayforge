---
name: latex-export
description: Convert Markdown-native writing to publication-ready LaTeX.
metadata:
  domain: paper
  category: latex
---

# Metadata
# Constraints
- [ ] No manual formatting into exported prose
- [ ] No bold/italic markers in prose (except titles)
- [ ] No broken citations or references
- [ ] Use British English

# Procedure
- [ ] **Preprocessing**
  - [ ] Clean markdown; remove bold/italic markers
  - [ ] Map markdown tables to tabular/booktabs
  - [ ] verify image paths and formats
- [ ] **Export**
  - [ ] Use `pandoc` or custom export scripts
  - [ ] map citations to BibTeX/BibLaTeX keys
- [ ] **Post-processing**
  - [ ] Review LaTeX preamble and includes
  - [ ] Run `pdflatex` or `latexmk`; check for warnings
  - [ ] Resolve cross-reference issues
- [ ] **Validation**
  - [ ] Confirm layout; check figure placement
  - [ ] Ensure formatting matches venue template
  - [ ] track citation gaps and TODO tags
