---
hidden: true
---

## AGENTS.md Guidance

During onboarding, propose or create AGENTS.md as a repo-specific practical entrypoint for AI agents:

Template/source rule: `base/AGENTS.md` is the generic placeholder template (`[FILL IN]` values preserved). During onboarding, fill repository-specific guidance into the target repository root `AGENTS.md`; do not remove placeholders from the template source.

1. Check if AGENTS.md exists and has useful content.
2. If missing or incomplete, propose creating/updating it with:
   - **Project Overview**: One sentence. What does this repository do? Who are the users?
   - **Build/Test Commands**: Build, test, lint, and run commands.
   - **Key Conventions & Constraints**: 2-4 rules that directly affect agent behavior (e.g., never commit .env, always dry-run first).
3. Reference `docs/ai/README.md` for durable AI memory (architecture, decisions, plans, logs).
4. Clarify the relationship: AGENTS.md = practical repo-specific entrypoint; docs/ai/README.md = durable memory index.
