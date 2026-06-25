# ADR-0017: Integrate Ponytail Reuse-First Discipline

Date: 2026-06-25
Status: Accepted

## Context

Our agents had Phase 1 reuse-first guidance ("inspect existing patterns before creating new logic") but lacked a structured discipline for deciding *when* new code is actually needed. The [ponytail](https://github.com/DietrichGebert/ponytail) project (MIT, v4.8.0) provides exactly this: a 7-rung ladder applied before any code, intensity levels (off/lite/full/ultra), and a `ponytail:` comment convention for deferred-simplification tracking.

The key architectural question was: what parts should be coded (deterministic) vs. embedded in prompts (requiring LLM judgment)?

## Decision

Adopt ponytail with a three-layer integration:

1. **Prompts (Phase 1)**: Embed the ladder directly into agent prompts. This is the fallback layer — agents always have the rules in-context even if the plugin is unavailable.

2. **Plugin (Phase 2)**: Extract deterministic concerns into a plugin (`base/opencode/plugins/ponytail/`):
   - `experimental.chat.system.transform` injects the ladder into the system prompt at configured intensity (avoids per-agent duplication)
   - `command.execute.before` intercepts `/ponytail <mode>` and persists to `~/.config/opencode/.ponytail-active`
   - `config` hook registers the skills directory
   - Zero npm dependencies (Node built-ins only), graceful degradation on missing hooks

3. **Commands & Skills (Phase 3)**: User-facing tooling — 6 commands for audit/review/debt/gain/help, 6 trigger-based skills for automatic discipline loading.

### Defaults

- Default intensity: `full` (standard 7-rung ladder)
- Overridable via `PONYTAIL_DEFAULT_MODE` env var
- Disable: `/ponytail off` or `PONYTAIL_DEFAULT_MODE=off`
- Mode persists across sessions

### Plugin vs. Prompt Split

| Layer | Mechanism | Rationale |
|-------|-----------|-----------|
| Deterministic injection | Plugin `system.transform` hook | No LLM judgment needed for text insertion |
| Mode persistence | Plugin `command.execute.before` hook | File I/O is deterministic |
| Ladder application | Prompt text + LLM judgment | Which rung applies is a judgment call |
| Scope classification | Planning logic in prompts | Decomposition requires context |

## Consequences

- Agents now have structured reuse-first discipline (7-rung ladder) rather than vague "prefer reuse" guidance
- Plugin injection reduces token duplication: rules injected once at system level instead of per agent (Phase 1 prompts serve as fallback)
- Intensity levels allow users to adjust strictness per session
- `ponytail:` comment convention enables systematic debt tracking across sessions
- No external dependencies or network calls — fully self-contained within ai-config
- Upstream ponytail is actively developed (v4.8.0 at adoption); periodic sync recommended for upstream command/skill improvements
