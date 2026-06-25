---
description: Audit the entire repository for over-engineering against the ponytail ladder.
agent: planner
---

Systematically audit the repository for over-engineering using the ponytail discipline.

$ARGUMENTS

Scan the codebase and identify:
- Duplicated logic that could use a shared utility (rung 2)
- Custom implementations of stdlib/native functionality (rungs 3-4)
- Overly complex solutions where a one-liner would suffice (rung 6)
- Unnecessary abstractions or premature generalization (rung 1)

Report findings grouped by severity. Flag patterns, not individual style nits. Focus on structural over-engineering with measurable simplification potential. Use `ponytail:` comments to mark findings for debt tracking.
