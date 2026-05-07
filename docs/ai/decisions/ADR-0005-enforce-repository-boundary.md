# ADR-0005: Enforce Repository Boundary

Date: 2026-05-07
Status: Accepted

## Context

The workflows are installed into target repositories through project-local symlinks, but agents can search, read, edit, or run commands from a broader filesystem context. Without an explicit boundary, onboarding, planning, implementation, quick delivery, and review can accidentally inspect or modify unrelated repositories or external paths.

## Decision

Treat the active repository root as the default boundary for all agent searches, reads, edits, commands, and reviews.

Agents must not operate outside that root unless the user explicitly approves the external path. Planner handoffs must include `Repository root:` so child agents inherit the same boundary. Cross-repository or external path review requires explicit user approval.

## Consequences

- Repository work stays isolated to the intended target project by default.
- Handoffs become slightly more explicit because they must name the repository root.
- Cross-repository work remains possible, but only after user approval of the external path or repository.
- Reviews can treat unexpected outside-root changes or references as scope risks.

## Alternatives Considered

- Allow agents to infer scope from the working directory only: rejected because nested shells, symlinks, or broad searches can still cross into unrelated paths.
- Permit read-only external searches by default: rejected because external context can leak unrelated project details and expand review scope without approval.
- Require a new boundary for every phase or quick task: rejected because the active repository root is the normal boundary and avoids repetitive decisions.
