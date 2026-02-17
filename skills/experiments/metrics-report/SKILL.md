# Skill: Metrics Report

## Trigger (when to use)

Use this skill when turning experiment outputs into a concise decision-ready report for engineering or research stakeholders.

## Inputs expected

- Raw metrics files or query results.
- Metric definitions, units, and aggregation windows.
- Baseline or control run data.
- Audience context (engineering decision, paper claim, incident follow-up).
- Time range and scenario tags.

## Procedure

1. Confirm metric definitions and expected directionality.
2. Validate data completeness and timestamp consistency.
3. Remove invalid records with explicit exclusion criteria.
4. Compute baseline statistics first.
5. Compute scenario statistics using identical windows.
6. Include variance descriptors (std, IQR, or CI).
7. Check for outliers and annotate likely causes.
8. Build a compact comparison table (baseline vs scenario).
9. Add one chart per primary question only.
10. Avoid chart overload; prioritize interpretability.
11. Write findings as claim + evidence + caveat.
12. Separate observed correlation from causal inference.
13. Add confidence level per key finding.
14. Explicitly state data gaps and collection risks.
15. Derive one recommended action per major finding.
16. Keep report sections short and scannable.
17. Validate numbers against source once before release.
18. Publish with reproducibility notes and command references.

## Output template

- Scope:
  - system, interval, scenarios
- Data quality:
  - completeness, exclusions, concerns
- Key metrics table:
  - metric | baseline | scenario | delta | uncertainty
- Findings:
  - F1: <claim + evidence + caveat>
  - F2: <claim + evidence + caveat>
- Decision impact:
  - <recommended actions>
- Reproducibility notes:
  - <source paths/queries/commands>

## Common failure modes

- Reporting deltas without baseline context.
- Mixing incompatible aggregation windows.
- Ignoring unit mismatches across sources.
- Overstating causality from observational data.
- Presenting noisy metrics without uncertainty.
- Hiding exclusion criteria used in cleanup.
- Too many charts with no clear decision signal.
- No linkage from findings to next actions.
