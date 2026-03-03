---
name: metrics
description: Transform raw experiment data into reproducible summaries and reports.
metadata:
  domain: experiments
  category: analysis
---

# Metadata
# Constraints
- [ ] No cherry-picked metrics or hidden data quality issues
- [ ] No statistical claims without stated assumptions
- [ ] No causation claims based only on correlation
- [ ] Reproducibility: use scripts over manual edits

# Procedure
- [ ] **Data Prep**
  - [ ] Clarify decision or hypothesis before analysis
  - [ ] Validate schema, units, ranges, and missingness
  - [ ] Separate cleaning logic from analysis logic
- [ ] **Analysis**
  - [ ] Start with simple aggregations/baselines
  - [ ] Apply baseline comparisons and uncertainty notes
  - [ ] Document data gaps and confidence levels
- [ ] **Reporting**
  - [ ] Generate decision-oriented findings
  - [ ] Include minimal visual diagnostics (tables/summaries)
  - [ ] Recommend concrete actions based on evidence
