# Session Token Tracker — Handoff from Issue #45

**Handoff date**: 2026-06-15
**Origin**: Issue [#45](https://github.com/Macacoders/ai-config/issues/45) (token-counter plugin)
**Status**: ✅ **Implemented 2026-06-15.** Spike confirmed SDK exposes provider-reported token consumption via `event` hook (`session.next.step.started` / `session.next.step.ended`). Plugin created at `base/opencode/plugins/session-tracker/` with in-memory per-agent/tool/command accumulator and `token_summary` tool. Registered in `opencode.jsonc` plugin array.

---

## What Was Built (Issue #45)

A `count_tokens` OpenCode plugin tool under `base/opencode/plugins/token-counter/` that counts tokens **in files on disk** — measures how many tokens an agent definition, command file, skill doc, or other AI config file contains. Useful for context-window budgeting but does **not** track runtime session consumption.

Key artifacts:
- `base/opencode/plugins/token-counter/index.js` — `count_tokens` tool
- `base/opencode/plugins/token-counter/package.json` — deps: `gpt-tokenizer`, peerDep: `@opencode-ai/plugin`
- `docs/ai/decisions/ADR-0011-tokenizer-selection.md` — `gpt-tokenizer` chosen (pure JS, `cl100k_base`)
- Installer propagation wired: `base/opencode/plugins/` → `.opencode/plugins/` in bootstrap + managed_sync

---

## What's Actually Wanted

A **session-level token consumption tracer** that, by the end of a conversation, provides traceability:

- Total tokens consumed for the session
- Breakdown by agent (planner, code, quickcode, test, research, taskanalyst)
- Breakdown by tool call (which tool consumed how many tokens)
- Breakdown by skill invocation
- Breakdown by command execution

This is fundamentally a **runtime telemetry** feature, not a static file analyzer.

---

## Infrastructure Already In Place (Reusable)

1. **Plugin directory**: `base/opencode/plugins/token-counter/` — the existing plugin can be extended or a companion plugin created alongside it.
2. **Installer propagation**: Plugins already propagate from `base/` → `.opencode/`. Adding new plugin files requires no installer changes.
3. **Config wiring**: `opencode.jsonc` already has `"plugin": [".opencode/plugins/token-counter"]`. A second plugin can be added to the array.
4. **ADR-0011**: Tokenizer selection already decided (`gpt-tokenizer`, `cl100k_base`).

---

## SDK Hooks to Investigate (Key Unknown)

The OpenCode plugin SDK (`@opencode-ai/plugin` v1.15.13) exposes hooks that are candidates for session tracking. The **spike** must determine which hooks carry token consumption data:

| Hook | Potential value | Question |
|---|---|---|
| `event` | Receives raw `Event` objects from the SDK | Do `Event` payloads include token usage from LLM responses? |
| `chat.message` | Fires on new messages, has `agent`, `model`, `messageID` | Does it carry response token metadata? |
| `chat.params` | Receives `maxOutputTokens` | Only input-side; doesn't tell actual consumption |
| `tool.execute.after` | Fires after tool execution | Could track tool call counts, but token cost of tool results depends on prompt construction |
| `command.execute.before` | Fires before command execution | Could track command invocation, but not token cost |
| `experimental.chat.messages.transform` | Sees message arrays | Could estimate tokens by re-tokenizing messages, but that's an approximation |

**Critical spike question**: Does the `Event` type or any hook provide actual provider-reported token usage (prompt tokens + completion tokens) from LLM responses? If not, the tracker would need to re-tokenize messages locally, which is an approximation.

Source files to inspect:
- `.opencode/node_modules/@opencode-ai/sdk/dist/index.d.ts` — `Event` type
- `.opencode/node_modules/@opencode-ai/sdk/dist/v2/gen/types.gen.d.ts` — generated types, likely has event payloads
- `.opencode/node_modules/@opencode-ai/plugin/dist/index.d.ts` — `Hooks` interface, `PluginInput`

---

## Recommended Approach for New Planner

1. **Create a new GitHub Issue** for the session token tracker (distinct from #45).
2. **Spike first**: Investigate the SDK `Event` type and hook payloads to determine what token consumption data is actually exposed. This is the make-or-break question.
3. **Design based on findings**:
   - If the SDK exposes provider-reported token counts → straightforward tracker that accumulates per-agent/tool/skill
   - If not → fall back to re-tokenizing messages locally with `gpt-tokenizer` (approximate, but still useful)
4. **Output format**: Consider a `/token-report` or `/token-summary` command that prints the session breakdown, or a tool that agents can call mid-session.
5. **Plugin location**: Either extend the existing `token-counter` plugin or create a sibling `session-tracker` plugin under `base/opencode/plugins/`.

---

## Repository State as of Handoff

```
Repository root: /home/spinaks/dev/ai-config
Branch: develop
Uncommitted changes:
  M install/bootstrap.ps1          (plugin propagation)
  M install/bootstrap.sh           (plugin propagation)
  M install/lib/managed_sync.ps1   (plugin path resolution)
  M install/lib/managed_sync.sh    (plugin path resolution)
  ?? base/opencode/plugins/        (new plugin source)
  ?? docs/ai/decisions/ADR-0011-tokenizer-selection.md
  ?? docs/ai/decisions/ADR-0010-uninstall-scripts.md
  ?? docs/ai/plans/2026-06-15-token-counter-plugin-issue-45.md

opencode.jsonc: includes "plugin": [".opencode/plugins/token-counter"]
.opencode/plugins/token-counter/: runtime copy of plugin (working)
```
