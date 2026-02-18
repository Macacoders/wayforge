---
name: metrics-report
description: Turn experiment or operational metrics into a concise, decision-ready report with uncertainty and reproducibility.
user-invokable: true
license: MIT
metadata:
  domain: experiments
  category: analysis
  risk-level: low
---

# Skill: Metrics Report

## Trigger (when to use)

Use this skill when turning experiment outputs into a concise decision-ready report for engineering or research stakeholders.

## Inputs expected

- Raw metrics files or query results.
- Metric definitions, units, and aggregation windows.
- Baseline or control run data.
- Audience context (engineering decision, paper claim, incident follow-up).
- Time range and scenario tags.
- Experiment configuration summary (topology, load, versions).

## Procedure

1. Clarify the primary question or decision this report supports.
2. Confirm metric definitions, expected directionality, and invariants.
3. Validate data completeness, timestamp consistency, and sample size adequacy.
4. Remove invalid records with explicit exclusion criteria.
5. Compute baseline statistics first.
6. Compute scenario statistics using identical windows and configuration context.
7. Include variance descriptors (std, IQR, or CI).
8. Quantify effect sizes and assess practical significance.
9. Check for outliers and annotate likely causes.
10. Build a compact comparison table (baseline vs scenario).
11. Add one chart per primary question only.
12. Avoid chart overload; prioritize interpretability.
13. Write findings as claim + evidence + caveat.
14. Separate observed correlation from causal inference.
15. Add confidence level per key finding.
16. Explicitly state data gaps and collection risks.
17. Derive one recommended action per major finding.
18. Keep report sections short and scannable.
19. Validate numbers against source once before release.
20. Publish with reproducibility notes and command references.

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
- Confidence summary:
  - <overall confidence level and justification>
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
- Ignoring experiment configuration drift between runs.
