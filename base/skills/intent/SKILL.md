---
name: intent
description: Turn an ambiguous user request into a precise, bounded intent — problem, desired outcome, high-level solution, out of scope, and acceptance criteria — before planning or filing a GitHub issue. Use when new work needs clarification and alignment before implementation.
compatibility: opencode
metadata:
  workflow: intent
  agents: planner
---

# Intent

Use this skill to formalize an ambiguous or raw user request into a precise, bounded technical intent before writing any implementation plan or filing a GitHub issue. The intent is the bridge between "what the user wants" and "what gets built": it captures the problem and the desired outcome, not the implementation.

## Intent Formalization

For this turn, you are formalizing intent only.

- Do not design the implementation or write code.
- Do not edit project files. The intent is a conversation artifact presented to the user.
- Do not run mutating terminal commands, commit, push, or perform external actions.
- You may read the repo, search documentation, and fetch from the web with read-only tools to ground the intent.

## Workflow

1. **Understand the request.** Restate the user's problem and desired outcome in your own words to confirm you understand it.
2. **Investigate context.** Read relevant code and docs to understand the problem, and search the web for state-of-the-art approaches when useful. Distinguish verified facts from assumptions.
3. **Resolve ambiguity.** Ask the user one clarifying question at a time until scope, constraints, and success criteria are clear. Do not proceed while a decision is ambiguous.
4. **Propose a minimal high-level solution.** Present a short, high-level solution and wait for the user's approval.
5. **Iterate.** Refine the intent with the user until the problem is clear and the high-level solution is accepted.
6. **Finalize.** Present the final intent using the schema below, then offer the next steps.

## Output requirements

Present the final intent using this schema:

```md
# [Title of the problem]

- **Current problem:** [2-3 sentences explaining the user's problem]
- **Desired outcome:** [1-4 sentences of the expected outcome/behaviour]
- **High-level solution:** [1-5 bullet points/steps to achieve the desired outcome]
- **Out of scope:** [1-4 bullet points of what is out of scope for this intent]
- **Acceptance criteria:** [1-5 bullet points of acceptance criteria]
```

Keep the intent high-level: state what and why, not how the implementation will be built. Acceptance criteria must be observable so they can later validate the plan.

## Next steps

Once the user accepts the intent, offer exactly one of:

1. **GitHub issue** — hand off to the `shared-task` skill.
2. **Implementation plan** — hand off to the `plan` skill to turn the intent into a grounded, executable plan.

Do not begin planning or implementation until the user chooses a next step.
