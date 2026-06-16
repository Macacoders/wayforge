---
description: Onboard an existing repository and prepare initial docs/ai memory before planning changes.
agent: planner
---

Perform repository onboarding before any implementation plan.

First establish the active repository root. Keep onboarding searches, reads, writes, and reviews inside that root unless the user explicitly approves an external path.

Use progressive disclosure. Inspect existing docs, structure, package/build files, tests, CI, entrypoints, and conventions. Invoke the `research` subagent with a compact handoff brief.

When onboarding AGENTS guidance, treat `base/AGENTS.md` as the generic placeholder template. Preserve template placeholders and ensure repository-specific root `AGENTS.md` guidance is filled in for the target repository.

The outcome should be a Repository Research Brief and either:

- initial routed `docs/ai/` memory when durable-memory writes are explicitly approved by planner/user or in the handoff, or
- a concise proposed memory plan (`path`, `why`, `router route`) when writing is not explicitly approved.

Do not plan feature work yet.

Additional context:

$ARGUMENTS
