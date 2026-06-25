# Code Handoff Brief Template

Use this format when invoking `code`:

```md
## Code Handoff Brief

Phase:
Goal:
Repository root:
Acceptance criteria:
Atomic stages:
Relevant files:
Confirmed decisions:
Constraints:
Reuse expectation: Required when touching repeatable logic; apply the ponytail ladder (YAGNI → existing codebase → stdlib → native platform → dependencies → one-liner → minimum new code) and name patterns/utilities/tests/conventions to inspect, or state why none are expected.
References to load:
Stop rule: Implement exactly one atomic stage, then stop. Atomic stages are not new phases. Report changed files, behavior changed, manual validation commands, risks, reuse outcome, and the next proposed stage. Wait for explicit user approval before continuing in this same child session.
```
