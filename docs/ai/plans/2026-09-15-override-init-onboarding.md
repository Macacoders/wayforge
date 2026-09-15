# Override /init as the onboarding entry point + general AGENTS.md template

**Status:** complete (Phases 1–3 done)

## Goal

Replace OpenCode's built-in `/init` with a full-repo-onboarding command (retiring `/onboard-repo`), and rewrite `base/AGENTS.md` into a lean, general template so generated AGENTS.md files carry only project-specific guidance + a brief ai-config workflow note — no ai-config boilerplate.

## Resolved decisions

1. Override `/init` (option a); retire `onboard-repo`.
2. Template lean (~50 lines), Coldtea-general sections + placeholders.
3. Generated AGENTS.md = project-specific + brief workflow usage; no `## Mission`/`## AI Memory Index` boilerplate.
4. Full onboarding: after `/init`, repo is ready to use (docs/ai scaffolded + populated, AGENTS.md built).
5. Delete `onboard-repo.md` + update all references.

## Phases

### Phase 1: Rewire `/init` + template

- Create `base/opencode/commands/init.md`.
- Delete `base/opencode/commands/onboard-repo.md`.
- Rewrite `base/AGENTS.md` (Coldtea sections + `[FILL IN]` + `## Working with ai-config`).
- Update `base/opencode/agents/research/references/agents-guidance.md`.
- Update `base/opencode/agents/research.md` (full-onboarding write approval under `/init`).

### Phase 2: Reference cleanup + memory + validation

- `README.md`, `docs/ai/architecture.md`: `/onboard-repo` → `/init`.
- ADR + monthly log.
- `make check` + dry-run smoke test.

## Out of scope / deferred

- Root `AGENTS.md` — user will regenerate via `/init` themselves.
- `base/opencode/agents/planner.md` drift vs installed planner — follow-up, not now.

## Decisions to record (Phase 2)

- ADR: override built-in `/init`; retire `/onboard-repo`.
- ADR: `base/AGENTS.md` is Coldtea-shaped, not ai-config self-description.
