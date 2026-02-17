# Skill: Related Work Compression

## Trigger (when to use)

Use this skill when related work is too long, repetitive, or unfocused and must be shortened while preserving positioning and citation coverage.

## Inputs expected

- Current related-work section text.
- Citation list with publication year and key contribution.
- Target word budget or page pressure constraints.
- Core novelty claims of the current paper.

## Procedure

1. Extract every sentence-level claim from the current section.
2. Map each claim to one of: background, taxonomy, gap, comparison, positioning.
3. Remove duplicate claims that differ only in wording.
4. Group citations into thematic clusters.
5. Keep one anchor citation per cluster, plus critical contrasts.
6. Convert per-paper summaries into synthesis sentences.
7. Ensure each paragraph ends with relevance to your contribution.
8. Delete historical detail that does not affect positioning.
9. Preserve adversarial citations that challenge your claim.
10. Check that key baselines used in experiments are still referenced.
11. Compress transitions and remove rhetorical filler.
12. Verify citation density remains credible after trimming.
13. Reorder paragraphs from broad context to direct competitors.
14. Add one explicit "gap" sentence before your contribution bridge.
15. Validate no citation key dropped accidentally from bibliography.
16. Run a final pass for consistent terminology.
17. Measure length against budget; trim low-value clauses.
18. Produce a before/after compression summary.
19. Ask whether any must-cite institutional or benchmark papers are missing.
20. Verify compressed text still supports reviewer-facing novelty claims.

## Output template

- Target budget: <words/pages>
- Before length: <count>
- After length: <count>
- Compression ratio: <percent>
- Kept themes:
  - <theme + representative citations>
- Removed/reduced themes:
  - <theme + rationale>
- Positioning statement:
  - <2-3 sentences>

## Common failure modes

- Over-trimming and losing key competitor references.
- Keeping citation count but losing synthesis quality.
- Removing negative or contrasting prior work.
- Weak transition from related work to contribution.
- Citation cluster imbalance across subtopics.
- Retaining historical detail with little relevance.
- Inconsistent terminology after aggressive edits.
- Missing bibliographic updates after deletions.
- Losing methodological distinctions between close baselines.
- Removing context needed for readers outside the immediate subfield.
