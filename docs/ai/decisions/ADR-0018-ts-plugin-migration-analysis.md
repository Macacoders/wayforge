# ADR-0018: TypeScript Plugin Migration Analysis — Viability Assessment

**Date:** 2026-07-01
**Status:** Accepted (analysis only — implementation deferred to follow-up issues)

## Context

Issue #85: The `ai-config` repository maintains agent configuration across multiple formats and locations:

- **Agent metadata** (`description`, `mode`, `temperature`) — YAML frontmatter in `base/opencode/agents/*.md`
- **Agent permissions** — `base/opencode/permissions/agents.yml` (81 lines, centrally maintained, rendered into frontmatter per ADR-0014)
- **Command definitions** — 14 Markdown files in `base/opencode/commands/*.md`
- **Tool definitions** — OpenCode built-ins plus plugin-provided tools (token-counter, session-tracker)
- **Agent prompts** — Long Markdown bodies in `base/opencode/agents/*.md` (63–171 lines per agent)

OpenCode supports TypeScript plugins with a `server()` entrypoint that can return tools, event hooks, config overrides, and system prompt transformations. Three plugins already exist (`ponytail`, `token-counter`, `session-tracker`), and a shared utility pattern (`lib/render-table.js`) was established by issue #149.

Issue #131 is simultaneously migrating the installer from Bash+PowerShell to TypeScript, which affects how permissions and plugin registration work.

## Assessment Method

Each source type was assessed against six criteria:
1. **Plugin API viability**: Does the `@opencode-ai/plugin` API have a hook or capability to represent this data?
2. **Proof**: Is the capability demonstrated in existing plugins?
3. **Installer impact**: What would change in the installer flow?
4. **Effort**: Low / Medium / High to implement
5. **Risk**: What could go wrong?
6. **Benefit**: What would we gain?

Evidence was gathered by inspecting all 6 agent files, all 14 command files, the permissions YAML, all 3 existing plugins, the installer managed_sync scripts, and the opencode.jsonc generation templates.

## Per-Source-Type Assessment

### 1. Agent Metadata (`description`, `mode`, `temperature`)

| Criterion | Assessment |
|-----------|-----------|
| **API viability** | No proven hook for overriding agent frontmatter metadata from a plugin |
| **Proof** | `config()` can set `skillsDir` (ponytail) but not agent description/mode |
| **Installer impact** | None — already handled by Markdown file sync |
| **Effort** | N/A — not viable |
| **Risk** | Low (no change) |
| **Benefit** | None (no migration possible) |

**Verdict: ❌ STAY in Markdown frontmatter**

`description` and `mode` are structural fields that OpenCode reads directly from the agent `.md` file. No plugin hook is known to override them. `temperature` could theoretically move to `opencode.jsonc` (like `model` and `steps`), but that would be a config template change, not a plugin migration.

---

### 2. Agent Permissions

| Criterion | Assessment |
|-----------|-----------|
| **API viability** | Unknown — `config()` can return configuration values, but whether it can set per-agent `edit`/`bash`/`task` permissions is unproven |
| **Proof** | No existing plugin sets agent permissions |
| **Installer impact** | High — `render_agent_with_central_permissions()` in managed_sync would be removed or bypassed |
| **Effort** | Medium — requires API investigation first |
| **Risk** | Medium — if `config()` cannot set permissions, alternative approach needed |
| **Benefit** | High — eliminates installer YAML→frontmatter rendering; permissions could be dynamic |

**Verdict: ⚠️ INVESTIGATE FURTHER — potential to move**

This is the most promising migration target. The centralized `agents.yml` is already a single source of truth — a plugin could read it and apply permissions dynamically at startup. This would:

- Eliminate ~200 lines of awk/PowerShell YAML rendering from managed_sync
- Remove the need for ADR-0014's frontmatter injection approach
- Make permissions dynamic (could change without re-installing)

**Blocking question**: Can the `@opencode-ai/plugin` `config()` hook (or another hook) set per-agent `edit`, `bash`, and `task` permissions?

**Note**: This supersedes ADR-0014 ("Agent permissions live in markdown frontmatter from centralized agents.yml"), which was written before the TS plugin API was proven in this repository.

**Dependency**: Issue #131 owns the installer TS migration. If permissions migrate to a plugin, the TS installer should never need to implement permission rendering — the plugin handles it at runtime. Best sequenced after #131 or as a follow-up to it.

---

### 3. Command Definitions

| Criterion | Assessment |
|-----------|-----------|
| **API viability** | Unknown — `command.execute.before` exists (proven) but this intercepts existing commands, not registers new ones. No `command.register` hook is proven |
| **Proof** | Ponytail proves command interception; no plugin proves command registration |
| **Installer impact** | High — command file sync could be removed; new plugin registered in opencode.jsonc |
| **Effort** | High — requires API feature + converting documentation-heavy bodies to code |
| **Risk** | High — command bodies are human-readable workflow instructions; hard to represent in TypeScript |
| **Benefit** | Moderate — fewer Markdown files; dynamic commands possible |

**Verdict: ❌ STAY as Markdown files (for now)**

Commands are inherently documentation-heavy. Each `.md` file contains workflow instructions that are read by agents. Converting these to TypeScript would lose readability and increase maintenance burden.

**Future option**: If OpenCode adds a plugin command-registration API, reassess. The command bodies could remain as Markdown with metadata in the plugin.

---

### 4. Tool Definitions

| Criterion | Assessment |
|-----------|-----------|
| **API viability** | ✅ Proven — `@opencode-ai/plugin/tool` exports `tool()` |
| **Proof** | `token-counter/index.js` and `session-tracker/index.js` both register custom tools |
| **Installer impact** | Low — plugin files are already synced; only need registration in opencode.jsonc |
| **Effort** | Low — the pattern is established |
| **Risk** | Low — proven pattern |
| **Benefit** | Already achieved |

**Verdict: ✅ ALREADY MIGRATED — plugin tool pattern is proven**

Custom tools should continue to be defined as plugins. Future tools (issues #104, #105: `compress_diff`, `compress_log`) should follow this pattern.

**Current gap**: Only `ponytail.mjs` is registered in the default `opencode.jsonc` template. The token-counter and session-tracker plugins, though synced to target repos, are NOT automatically registered. They require manual addition to `opencode.jsonc`. The installer template should be updated to auto-discover or register all plugins.

---

### 5. Agent Prompts (Long Markdown Bodies)

| Criterion | Assessment |
|-----------|-----------|
| **API viability** | Partial — `experimental.chat.system.transform` can APPEND to system prompt but cannot replace the agent file's primary instructions |
| **Proof** | Ponytail proves appending; no plugin proves prompt replacement |
| **Installer impact** | None |
| **Effort** | N/A — not recommended |
| **Risk** | High — splitting core agent instructions across Markdown + plugins creates maintenance fragmentation |
| **Benefit** | Low — system transform is fine for cross-cutting rules but not per-agent prompts |

**Verdict: ❌ STAY in Markdown files**

Agent prompts are the primary instruction source and behavioral documentation. The `experimental.chat.system.transform` hook is appropriate for cross-cutting concerns (reuse-first discipline, global safety rules) but should not replace per-agent prompt content.

---

### 6. Plugin Registration & Installer Interaction

**Current state**: The `opencode.jsonc` template hardcodes `"plugin": ["./.opencode/plugins/ponytail/ponytail.mjs"]`. There is no auto-discovery of plugins.

**Gap**: Each new plugin requires manual updates to both `bootstrap.sh` and `bootstrap.ps1` templates. This is error-prone and will become a maintenance burden as more plugins are added.

**Recommendation**: The installer should auto-discover plugins in `base/opencode/plugins/` and generate the `"plugin"` array. This is a small change that eliminates a recurring manual step.

---

## Plugin API Surface — Known & Unknown

### Proven hooks (can depend on):

| Hook | Proven By | Use Case |
|------|-----------|----------|
| `config()` | ponytail | Return config overrides (skillsDir) |
| `tool` | token-counter, session-tracker | Register tools with schema |
| `event` | session-tracker | Handle runtime events |
| `experimental.chat.system.transform` | ponytail | Inject into system prompt |
| `command.execute.before` | ponytail, session-tracker | Intercept commands |
| `command.execute.after` | session-tracker | Post-command hook |
| `chat.params` | session-tracker | Capture chat parameters |
| `tool.execute.after` | session-tracker | Post-tool hook |

### Unknown (needs investigation before implementation):

| Capability | Needed For | Priority |
|------------|-----------|----------|
| Can `config()` set agent permissions? | Permissions migration | High |
| Is there a `command.register` hook? | Command migration | Low |
| Can `config()` return agent metadata? | Metadata migration | Low |
| Can system transform replace (not just append)? | Prompt migration | Low |

---

## Recommendations & Migration Order

### Phase 1 (now — analysis complete)
✅ Write this ADR
✅ Create follow-up implementation issues

### Phase 2 (after #131 installer TS migration)
1. **Investigate plugin API** for agent permission configuration — single focused spike
2. If viable: **Create permissions plugin** that reads `agents.yml` and applies permissions dynamically
3. If not viable: Keep ADR-0014 approach; document finding

### Phase 3 (medium-term)
4. **Auto-discover plugins** in installer — update `opencode.jsonc` template to scan `base/opencode/plugins/` and generate plugin array
5. **Register existing plugins** (token-counter, session-tracker) in the generated config automatically

### Phase 4 (future)
6. **Reassess command migration** — if OpenCode adds plugin command registration, evaluate
7. **Reassess metadata migration** — if OpenCode adds agent config hooks, evaluate

### Not recommended for migration
- Agent metadata (description, mode) — no plugin hook exists
- Agent prompts — should remain as primary Markdown instruction source
- Command bodies — documentation-heavy, low benefit

---

## Risks

1. **Plugin API gaps**: The `config()` hook may not support agent permission configuration. If investigation finds it doesn't, permissions stay in YAML+frontmatter.
2. **#131 sequencing**: If permissions migration is attempted before #131 stabilizes the TS installer, there's risk of duplicated effort or conflicting approaches.
3. **Plugin registration burden**: Without auto-discovery, each new plugin requires manual installer template edits in two scripts.
4. **ADR-0014 superseding**: ADR-0014 explicitly decided permissions go in frontmatter. Revisiting this requires updating the ADR.

## Benefits if Implemented

1. **Eliminate YAML→frontmatter rendering** (~200 lines of awk/PowerShell) from managed_sync
2. **Dynamic permissions** — changes to `agents.yml` take effect without re-installing
3. **Simpler installer** — no permission injection logic needed
4. **Plugin auto-discovery** — eliminates manual registration step

## Decisions Recorded

1. Agent metadata stays in Markdown frontmatter — not viable for plugin migration
2. Agent permissions are the primary migration candidate — requires API investigation first
3. Command definitions stay as Markdown (for now) — plugin command registration unproven
4. Tool plugin pattern is proven — continue for new tools (issues #104, #105)
5. Agent prompts stay as Markdown — system transform is for augmentation only
6. Installer should auto-discover plugins — update opencode.jsonc template
7. ADR-0014 is candidate for superseding if permissions plugin becomes viable

## Related ADRs

- **ADR-0014** (superseded if permissions move to plugin): Agent permissions in Markdown frontmatter from centralized agents.yml
- **ADR-0017** (single TS gh-issue): Proved TS toolchain in this repository
- **Issue #131**: Installer TS migration — permissions plugin sequenced after this
- **Issue #149**: Plugin renderTable utility — proved shared plugin library pattern
