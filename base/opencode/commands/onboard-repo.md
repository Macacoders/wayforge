---
description: Onboard an existing repository and prepare initial docs/ai memory before planning changes.
agent: planner
---

Perform repository onboarding before any implementation plan.

First establish the active repository root. Keep onboarding searches, reads, writes, and reviews inside that root unless the user explicitly approves an external path.

Use progressive disclosure. Inspect existing docs, structure, package/build files, tests, CI, entrypoints, and conventions. Invoke the `research` subagent with a compact handoff brief.

The outcome should be a Repository Research Brief and initial `docs/ai/` memory, or a proposed memory plan if writing is not approved.

Do not plan feature work yet.

Additional context:

$ARGUMENTS
