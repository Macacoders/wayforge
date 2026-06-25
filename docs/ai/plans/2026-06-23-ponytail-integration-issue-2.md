# Ponytail Integration — Reuse-First Enhancement (Issue #2)

Date: 2026-06-23  
Repository root: `/home/spinaks/dev/ai-config`  
Status: Complete — Phase 1 complete, Phase 2 complete, Phase 3 complete  
Issue: #2

## Goal

Integrate ponytail's structured reuse-first discipline into ai-config, building on the completed Phase 1 reuse-first guidance. Identify which parts are deterministic (plugin/code) vs. requiring LLM judgment (prompts), and implement them in the right layer.

### What Ponytail Is

Ponytail (https://github.com/DietrichGebert/ponytail, MIT, 50k+ stars) is a prompt-engineering discipline that makes AI agents write only the minimal code needed. Its core mechanism is a **7-rung "ladder"** applied before any code:

1. Does this need to exist? (YAGNI) → skip it
2. Already in this codebase? → reuse it
3. Stdlib does it? → use it
4. Native platform feature? → use it
5. Installed dependency solves it? → use it
6. One line? → one line
7. Only then: write the minimum that works

It supports 4 intensity levels (`off`, `lite`, `full`, `ultra`) with mode persistence, and ships companion commands for diff/repo audit, debt tracking, and gain reporting. For OpenCode it provides a plugin (`.opencode/plugins/ponytail.mjs`) that injects rules into every system prompt via `experimental.chat.system.transform` plus commands and skills.

### Where We Stand

Phase 1 of Issue #2 (completed 2026-06-09) added reuse-first guidance to all four agents and handoff templates. Our agents now say "inspect existing patterns before creating new logic" — but they lack the structured ladder, mode persistence, intensity levels, and audit tooling that ponytail provides.

## Deterministic vs. Non-Deterministic Analysis

| Mechanism | Currently | Can be coded? |
|-----------|-----------|---------------|
| Ruleset injection into system prompt | Embedded in each agent `.md` | ✅ Plugin `system.transform` hook |
| Mode persistence (lite/full/ultra/off) | Not applicable | ✅ File read/write |
| `/ponytail` command dispatch | Not applicable | ✅ `command.execute.before` hook |
| Token counting | Already a plugin | ✅ Already done |
| Session tracking | Already a plugin | ✅ Already done |
| Managed file sync | Already in installer | ✅ Already done |
| `ponytail:` comment convention | Not applicable | ❌ Requires LLM to use it |
| Ladder application (pick a rung) | Not structured | ❌ Requires LLM judgment |
| Scope classification | Planning logic | ❌ Requires LLM judgment |
| Phase decomposition | Planning logic | ❌ Requires LLM judgment |

**Key insight**: The *injection mechanism* and *mode management* are deterministic and should be coded. The *decision-making* (which rung applies, whether code is needed) requires LLM judgment embedded in prompts. The ponytail plugin demonstrates the right split: deterministic injection + prompt-based guidance.

## Scope Classification

Size: Medium  
Phase budget: 3 phases  
Phase budget rationale: Phase 1 embeds the ladder into agent prompts (prompt work). Phase 2 creates the plugin infrastructure for deterministic injection/mode management. Phase 3 adds audit commands and documentation. Each phase has clean reviewable deliverables.  
Quick delivery eligible: No  
Split required: No

---

## Phases

### Phase 1: Embed the Ponytail Ladder into Agent Prompts

**Scope:** Integrate the structured 7-rung ladder and intensity guidance directly into our existing agent prompts, extending the reuse-first rules from Phase 1.

**Rationale:** Prompts are the foundational layer. The plugin (Phase 2) can inject rules, but agents still need the ladder in their own reasoning context. This is the lowest-risk change and builds directly on completed Phase 1 work.

**Files to change:**

| File | Change | Why |
|------|--------|-----|
| `base/opencode/agents/planner.md` | Add ladder summary to Core Rules; enhance reuse rule with rung structure; add `ponytail:` comment convention | Planner orchestrates all agents — must model the ladder |
| `base/opencode/agents/code.md` | Enhance "Prefer the smallest correct change" with explicit ladder rungs; add YAGNI before "inspect existing patterns"; add stdlib/native rung | Primary implementation agent |
| `base/opencode/agents/quickcode.md` | Same ladder enrichment as code (shorter, matching quickcode's low-token profile) | Quick delivery implementation agent |
| `base/opencode/agents/test.md` | Add ladder awareness: "Before recommending a test, climb: does this behavior already have coverage? does existing validation catch it? is this a one-liner that needs no test?" | ponytail's test philosophy aligns with our opt-in test approach |
| `base/opencode/agents/planner/references/code-handoff-template.md` | Add explicit rung-awareness to reuse expectation field | Handoff completeness |
| `base/opencode/agents/planner/references/quickcode-handoff-template.md` | Same field addition | Handoff completeness |

**Files explicitly NOT changed in Phase 1:**
- `templates/AGENTS.md` — already has the reuse-first contract; ladder detail lives in agent prompts
- `README.md` — already documents reuse-first; ladder mention added in Phase 3 with full docs

**New additions:** None (prompt enrichment only).

**Files removed/truncated:** None.

**Acceptance criteria:**
- All 4 agent prompts contain the ponytail ladder (or a concise reference)
- The ladder is proportional to agent role (planner gets full ladder, implementation agents get focused ladder, test gets test-specific ladder)
- Existing guidance (repository boundary, phase economy, test rules) is preserved, not replaced
- Token cost increase is minimal (<200 tokens per agent)
- Handoff templates include rung-awareness

**Risks:**
- Over-embedding: making prompts too long. Mitigation: keep ladder concise, reference it rather than fully restate in every agent.
- Conflict with existing rules: our "prefer smallest correct change" is compatible. The ladder *refines* existing rules, doesn't replace them.

### Phase 2: Create Deterministic Plugin for Ruleset Injection & Mode Management

**Scope:** Create a ponytail plugin that handles the deterministic parts: ruleset injection into system prompt, mode persistence across turns, and `/ponytail` command dispatch. This extracts the reusable mechanism from prompt text into code.

**Rationale:** The injection mechanism and mode management are deterministic — they don't need LLM judgment. Coding them into a plugin reduces prompt token cost (rules injected once at system level rather than duplicated per agent), ensures consistent application across all agents, and enables mode switching that persists across sessions.

**Files to create:**

| File | Purpose |
|------|---------|
| `base/opencode/plugins/ponytail/ponytail.mjs` | Plugin entry point: `config` hook registers skills dir, `system.transform` injects rules, `command.execute.before` persists mode |
| `base/opencode/plugins/ponytail/ponytail-instructions.js` | Shared instruction builder: builds ladder ruleset text per intensity level (adapted from upstream) |
| `base/opencode/plugins/ponytail/ponytail-config.js` | Configuration resolver: default mode from env var or config file, mode validation |
| `base/opencode/plugins/ponytail/package.json` | Minimal package metadata (`"type": "module"`) |

**Files to change:**

| File | Change | Why |
|------|--------|-----|
| `install/bootstrap.sh` | Generate `"plugin"` field in output `opencode.jsonc` / `kilo.jsonc` with ponytail entry | Plugin needs explicit registration; current jsonc has no `plugin` field |
| `install/bootstrap.ps1` | PowerShell parity for `plugin` field generation | Cross-platform parity |

**Transition note:** After Phase 2, the ladder rules from Phase 1 remain in agent prompts as fallback. If the plugin hook is unavailable (e.g., experimental API), agents still have the rules in-context. Mark Phase 1 additions with a comment noting they're also injected by plugin for eventual consolidation in a future cleanup phase.

**Acceptance criteria:**
- Plugin installed as `base/opencode/plugins/ponytail/ponytail.mjs` with supporting JS files
- Installer generates `"plugin": ["./.opencode/plugins/ponytail/ponytail.mjs"]` in opencode.jsonc
- Plugin injects ladder ruleset into system prompt at configured intensity
- `/ponytail lite|full|ultra|off` persists mode across turns
- Default mode is `full`, overridable via `PONYTAIL_DEFAULT_MODE` env var
- Plugin gracefully degrades (silent no-op) when hooks aren't available
- Both Bash and PowerShell installers produce identical plugin registration
- Plugin stays within our repository boundary (no network calls, no external deps)

**Risks:**
- **Plugin API stability**: `experimental.chat.system.transform` may change. Mitigation: silent no-op on missing hooks; ladder stays in agent prompts as fallback.
- **Mode file location**: `~/.config/opencode/.ponytail-active` shared across projects. Mitigation: document clearly; single global mode is the intended design (matches upstream).
- **Installer complexity**: Adding `plugin` field to generated jsonc is a new concern. Mitigation: keep it minimal — one array entry only.

### Phase 3: Add Audit Commands, Skills, and Documentation

**Scope:** Add ponytail companion commands and skills for reviewing over-engineering, tracking debt, and reporting gains. Update documentation to reflect the full integration.

**Rationale:** Commands and skills make the ponytail discipline actionable beyond passive prompt injection. Documentation ensures users and consuming repositories understand the integration.

**Files to create:**

| File | Purpose |
|------|---------|
| `base/opencode/commands/ponytail.md` | `/ponytail [lite\|full\|ultra\|off]` — mode switch command |
| `base/opencode/commands/ponytail-review.md` | `/ponytail-review` — review current diff for over-engineering |
| `base/opencode/commands/ponytail-audit.md` | `/ponytail-audit` — whole-repo audit for over-engineering |
| `base/opencode/commands/ponytail-debt.md` | `/ponytail-debt` — harvest deferred `ponytail:` shortcuts into a ledger |
| `base/opencode/commands/ponytail-gain.md` | `/ponytail-gain` — impact scoreboard (less code, less cost, more speed) |
| `base/opencode/commands/ponytail-help.md` | `/ponytail-help` — quick reference for all ponytail commands |
| `base/opencode/skills/ponytail/SKILL.md` | Core ponytail skill — triggers on "ponytail", "be lazy", "lazy mode", "yagni", "simplest solution", etc. |
| `base/opencode/skills/ponytail-review/SKILL.md` | Review skill |
| `base/opencode/skills/ponytail-audit/SKILL.md` | Audit skill |
| `base/opencode/skills/ponytail-debt/SKILL.md` | Debt tracking skill |
| `base/opencode/skills/ponytail-gain/SKILL.md` | Gain reporting skill |
| `base/opencode/skills/ponytail-help/SKILL.md` | Help skill |

**Files to change:**

| File | Change | Why |
|------|--------|-----|
| `README.md` | Add ponytail section: ladder summary, commands, intensity levels, how to disable (`/ponytail off` or `PONYTAIL_DEFAULT_MODE=off`) | User-facing documentation |
| `base/AGENTS.md` | Add ponytail mention in generic template so consuming repos know about it | Template completeness |
| `docs/ai/architecture.md` | Add plugin injection hook path to installed surface description | Architecture accuracy |

**Files removed/truncated:** None.

**Acceptance criteria:**
- All 6 ponytail commands installable and discoverable via `/ponytail*`
- All 6 ponytail skills loadable and triggered on appropriate keywords
- Commands and skills adapted for our agent topology (tailored to planner/code/quickcode/test model)
- README documents ponytail integration: ladder, commands, intensity levels, disable path
- Architecture doc reflects plugin injection mechanism

**Risks:**
- **Command/skill count**: 6 commands + 6 skills is substantial. Mitigation: each skill is minimal (~30-60 lines like upstream). Consider combining some if overlap is high after drafting.
- **Upstream drift**: Ponytail is actively developed (v4.8.0). Mitigation: document adapted-from version; plan periodic sync when upstream makes significant changes.

---

## Validation Strategy

- **Phase 1**: Review `git diff` for agent prompt changes only. Run `make check` for format issues. Manual token-count review on changed agent files.
- **Phase 2**: Dry-run installer (`./install/bootstrap.sh --repo /tmp/test-repo --dry-run`), verify generated jsonc includes `plugin` field with correct path. Test plugin loads without errors. Test `/ponytail full` mode switch persists to state file. Run `make check` for any format/lint issues.
- **Phase 3**: Same dry-run validation. Manual review of command/skill discoverability. Documentation review for accuracy and completeness.

No new tests expected for Phase 1 (prompt-only). Phase 2 may warrant a Bats/Pester test for the jsonc `plugin` field generation. Phase 3 is documentation-heavy; no new tests needed unless a command contains logic that can regress.

---

## Decisions To Record (Post-Approval)

1. **ADR**: Ponytail integration — why adopted, what adapted, mode defaults (`full`), plugin vs. prompt split, upstream version pinned (v4.8.0 at time of research).
2. **Architecture update**: Plugin injection hook documented in installed surface description.
3. **Plan status update**: This plan updated with phase completion status after each phase.

---

## Summary Table

| What | Phase | Type | Files | Rationale |
|------|-------|------|-------|-----------|
| Agent prompts | 1 | Change | 4 agent `.md` files | Embed ladder into existing reuse-first rules |
| Handoff templates | 1 | Change | 2 template `.md` files | Add rung-awareness field |
| Plugin `.mjs` + JS support | 2 | New | 4 files under `plugins/ponytail/` | Deterministic injection & mode management |
| Installer jsonc generation | 2 | Change | `bootstrap.sh`, `bootstrap.ps1` | Register plugin in generated config |
| Commands | 3 | New | 6 files under `commands/` | Audit/review/debt/gain/help |
| Skills | 3 | New | 6 files under `skills/` | Trigger-based skill loading |
| Documentation | 3 | Change | `README.md`, `base/AGENTS.md`, `architecture.md` | User + architecture docs |
| Nothing removed | All | — | — | Everything additive or enhancing |
