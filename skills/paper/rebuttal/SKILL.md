# Skill: Rebuttal Drafting

## Trigger (when to use)

Use this skill when responding to reviewer comments for conference or journal submissions and you need concise, evidence-based rebuttal text.

## Inputs expected

- Reviewer comments grouped by reviewer ID.
- Current manuscript draft and appendix.
- Experiment logs or additional runs relevant to objections.
- Venue rebuttal constraints (word or character limits).
- Author priorities (must-defend vs willing-to-concede points).

## Procedure

1. Normalize comments into atomic issues.
2. Label each issue: correctness, novelty, clarity, experiment gap, presentation.
3. Mark severity: blocker, high, medium, low.
4. For each issue, write one-sentence claim of reviewer concern.
5. Collect supporting evidence from existing paper first.
6. If evidence is missing, identify fastest valid follow-up analysis.
7. Draft response skeleton: acknowledge, clarify, evidence, action.
8. Keep tone neutral and constructive; avoid defensive language.
9. Avoid introducing unverified new claims.
10. If new experiment was run, include setup and result delta briefly.
11. For each response, add explicit manuscript change commitment.
12. Track unresolved points in an issue table.
13. Prioritize blockers and high-severity concerns within length budget.
14. Compress wording: remove repeated framing and hedge phrases.
15. Ensure terminology matches manuscript sections and notation.
16. Verify each reviewer concern receives a direct answer.
17. Add cross-review consistency checks to avoid contradiction.
18. End with a concise summary of major revisions.

## Output template

Use this shape for each reviewer item:

- Reviewer: R?
- Concern: <single-sentence concern>
- Response:
  - Acknowledgement: <brief>
  - Clarification/Evidence: <facts tied to paper/experiments>
  - Action in revision: <exact section/figure/table updates>
- Status: resolved | partially resolved | open

Closing block:

- Main revisions committed
- New experiments added (if any)
- Remaining limitations acknowledged

## Common failure modes

- Overly defensive tone that escalates reviewer skepticism.
- Long responses that do not directly answer the concern.
- New claims added without reproducible evidence.
- Contradictory statements across reviewer responses.
- Ignoring rebuttal length constraints until late edits.
- Vague revision commitments without section-level targets.
- Treating clarity issues as novelty disputes.
- Failing to flag unresolved concerns transparently.
