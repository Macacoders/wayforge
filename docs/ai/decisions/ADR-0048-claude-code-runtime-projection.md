# ADR-0048: Claude Code runtime projection

Date: 2026-11-05
Status: Accepted (decision)
Verification: pending human smoke

## Context

Issue #293 adds Claude Code as a third wayforge runtime. ADR-0046 limited the supported runtimes to OpenCode and Kilo Code, kept `.agents/` as the single canonical installed tree, and deferred per-runtime materialization of that tree into native directories. Claude Code cannot be served by pointers alone: its agent files use Claude-native frontmatter (`name`, `description`, `tools`, `disallowedTools`, `model`, `permissionMode`, `skills`), it merges commands into skills (a `.claude/commands/foo.md` and a `.claude/skills/foo/SKILL.md` both create `/foo`, and the skill wins), it removes `AskUserQuestion` from every subagent, and it has no provider config or per-agent model block. The OpenCode frontmatter (`mode`, `temperature`, injected `permission:` blocks) must therefore be translated at install time, which means Claude needs generated files, not indirection.

## Decision

1. **Runtime name: `claude`.** It is a **projection runtime**: the six existing wayforge agents (`planner`, `delivery`, `troubleshooter`, `research`, `code`, `architect`) and the existing commands/skills are generated as Claude-native files because their frontmatter must be translated. No new agent roles are introduced.
2. **`.claude/**` and `CLAUDE.md` are generated build artifacts, not a checked-in second source.** There is no `base/claude/**` mirror and no duplicated agent/command/skill content in the repository. The projection is generated from `sourceDir/base/**` at install time — the same source the generated `opencode.jsonc`/`kilo.jsonc` configs use — not from the installed `.agents/**`. The wayforge repository's own `.claude/` output is gitignored, like `.agents/`, `.opencode/`, and `.kilo/`.
3. **`layout.ts` models runtimes explicitly.** A runtime may have a generated config file and pointer paths, both optional. Claude has neither; it adds the `CLAUDE_*` constants (`.claude/agents`, `.claude/commands`, `.claude/skills`, `CLAUDE.md`). `configFileFor('claude')` is `null` and `pointerPathsFor('claude')` is empty.
4. **Agent projection.** Each `base/agents/<name>.md` becomes `.claude/agents/<name>.md` with Claude-native frontmatter derived from `base/permissions/agents.yml`: `tools` (base set `Read, Grep, Glob, Bash, PowerShell, WebFetch, WebSearch, Skill, TodoWrite`, plus `Edit`/`Write`/`NotebookEdit` per edit permission, `AskUserQuestion` when `question: allow`, and `Agent(research, code, architect)` for planner/delivery task allow-lists), `disallowedTools: Edit, Write, NotebookEdit` for `architect` (`edit: deny`), `permissionMode: acceptEdits` only for `edit: allow` (`code`), and `model: inherit` by default or the installer-selected Claude alias/ID (`sonnet`, `opus`, `haiku`, `fable`, or a `claude-*` model ID). OpenCode-only fields (`mode`, `permission`, `temperature`) are stripped; the body markdown is preserved otherwise.
5. **Skills/commands: skill-first collision policy.** Exactly one entrypoint per name; no name is emitted twice:
   - The 9 colliding command+skill names (`intent`, `plan`, `triage`, `ponytail`, `ponytail-audit`, `ponytail-debt`, `ponytail-gain`, `ponytail-help`, `ponytail-review`) become generated `.claude/skills/<name>/SKILL.md` with the command's `agent:` routing re-attached as a role line (`Act as the <agent> agent. Read .claude/agents/<agent>.md and follow its instructions.`) and an explicit `## Additional scope or clarification` section containing `$ARGUMENTS`. No `.claude/commands/<name>.md` is emitted, because the skill would shadow it.
   - The 6 command-only names (`implement-task`, `init`, `issue`, `load-plan`, `memory`, `review-task`) become generated `.claude/commands/<name>.md` with the source `description`, the role line when `agent:` is present, and the source body including `$ARGUMENTS`.
   - The 4 skill-only names (`ai-memory`, `create-skill`, `memory-maintenance`, `shared-task`) are exposed as `.claude/skills/<name>` links into `.agents/skills/<name>`.
   - The canonical `.agents/commands/<name>.md` stays for OpenCode/Kilo; the collision set is derived at install time from `base/commands/*.md` and `base/skills/*/SKILL.md`, never hardcoded.
6. **Memory: `CLAUDE.md` imports `@AGENTS.md`** plus a one-line generated-by note. No workflow rules are duplicated; `AGENTS.md` remains the single source of truth. Claude Code reads `AGENTS.md` directly on newer versions, but the import also covers older versions and sessions where AGENTS.md support is unavailable.
7. **Skill links: relative symlink first, junction fallback, managed-copy fallback.** The link reuses the pointer link helpers; if neither symlink nor junction creation works on the repository volume, the skill tree is copied and the copied files are tracked through the managed lifecycle. Link paths are manifest-tracked, so uninstall removes symlink, junction, and copy variants alike. Dry-run never probes symlink capability and never writes.
8. **Lifecycle.** Generated Claude content is content-aware (`syncManagedContent`): reinstall is idempotent (no duplicate manifest entries, no rewritten files when content is unchanged) and refreshes changed managed content. `--force` regenerates all managed Claude files and replaces managed skill links; it never overwrites unmanaged `.claude` content. `--dry-run` performs no writes and no symlink capability probe. Stale projections (a name removed from `base/**`, or a skill-only name that becomes colliding) are pruned or replaced before the new projection is written; symlinks are never written through. `wfg uninstall` removes manifest-tracked Claude files, `CLAUDE.md`, and skill links, then cleans emptied directories up to the repo root. **Uninstall also removes `AGENTS.md`**, because it is a manifest-tracked managed path under the existing uninstall contract — this corrects the plan's Task 4 case-5 wording ("AGENTS.md remains"), which was a plan defect.
9. **Ponytail split.** The ponytail **skills/commands are portable markdown** and are projected: `/ponytail-review`, `/ponytail-audit`, `/ponytail-debt`, and `/ponytail-gain` are self-contained prompt workflows that work without the plugin. `/ponytail` mode switching becomes **guidance-only** in Claude (no `command.execute.before` persistence to `~/.config/opencode/.ponytail-active` and no `experimental.chat.system.transform` injection), and `/ponytail-help` must drop or annotate its `~/.config/opencode/.ponytail-active` lines. The **plugin port** (`base/plugins/ponytail/ponytail.mjs` hooks) is out of scope per Issue #293 and is a follow-up. OpenCode-specific wording elsewhere is kept as harmless metadata: `compatibility: opencode` is ignored by Claude, and `create-skill`'s OpenCode phrasing is projected as-is.
10. **Explicit amendment of ADR-0046 Decisions 3, 6, and 7.** A third runtime exists. Generated projection is permitted **only** for Claude's translated surface; pointer indirection plus generated config remains the default (and only) mechanism for OpenCode and Kilo, and materialization is not a general OpenCode/Kilo fallback. ADR-0046 Decision 6's "generated stubs are deferred" stands for OpenCode/Kilo; Claude's projection is a distinct, justified exception: agent frontmatter is translated into Claude-native fields, while skill and command bodies are copied with the command's role line re-attached rather than rewritten.

## What is lost or degraded in the Claude projection

This is the accepted-loss register. "Material" means it weakens a safety or behavior contract and needs explicit user-facing documentation; "minor" means it is a cosmetic or convenience difference.

| Area | OpenCode / Kilo behavior | Claude projection | Impact | Mitigation / follow-up |
| --- | --- | --- | --- | --- |
| Ponytail plugin system-prompt injection | `experimental.chat.system.transform` injects the reuse-first ladder at the configured intensity | No plugin; the ladder is only present when a ponytail skill is invoked | Minor | Invoke `/ponytail` or `/ponytail-review` explicitly; future Claude hook port |
| Ponytail mode persistence | `command.execute.before` persists the mode to `~/.config/opencode/.ponytail-active` | No persistence; `/ponytail [mode]` is guidance-only per invocation | Minor | Future Claude hook port; document that mode does not survive sessions |
| Ponytail help text | Describes OpenCode paths and plugin behavior | Same text would be inaccurate | Minor | Adjust/annotate `ponytail-help` in the Claude projection |
| `temperature: 0.1` on `code` | Lower-variance implementation behavior | Dropped; Claude Code has no temperature control | Minor, accepted | Do not map to `effort`; record as an accepted loss |
| Default agent (`default_agent: planner`) | Every session starts as planner | No generated default-agent setting; the session starts as Claude's default agent | Material for workflow parity | Run `claude --agent planner`, or set the `agent` setting manually; future managed `.claude/settings.json` if merge semantics are safe |
| Primary vs subagent `mode` | `planner`, `delivery`, `troubleshooter` run as primary agents | Claude agent files are subagents; primary behavior requires `claude --agent` or the inline role line in a command | Material | Commands prepend a role line; document `claude --agent` for full-session use |
| `AskUserQuestion` | Planner/troubleshooter can ask clarifying questions | Claude removes `AskUserQuestion` from every subagent | Material | Works only when the agent runs as the main session; inline command role keeps questions available; document this |
| `task` allow-list | Planner/delivery can only spawn `research`, `code`, `architect` | `Agent(research, code, architect)` is enforced only in main-session `--agent` mode; in a subagent the type list is ignored | Material | Document that subagent mode cannot enforce the allow-list; use `claude --agent planner` when the restriction matters |
| `bash` deny prefixes | `sudo*`, `rm -rf*`, `git push --force*`, `git push -f*` are denied per agent | Bash/PowerShell stay broadly allowed; per-command denies cannot be expressed per subagent | **Material (safety)** | Document prominently; optional future `.claude/settings.json` `permissions.deny` (session-wide, affects all agents) |
| `external_directory` | `"*": deny`, `/tmp/**`: allow per agent | No per-subagent path rule | **Material (safety)** | Document; session-wide Claude permissions/additional-directories are the only lever |
| `permissionMode` | Edit permissions are enforced by the agent permission block | `permissionMode` is ignored when the main conversation is in `bypassPermissions`, `acceptEdits`, or auto mode | Material | Document; users should not run the main session in a mode that overrides the agent's intent |
| Per-agent model defaults | `base/config/agents/*.jsonc` assigns provider-specific models per agent | No provider config; only `model: inherit` or one global `--model` for all agents | Material for parity | Default `inherit`; optional `--model`; per-agent Claude map is a future feature |
| `small_model` | A separate small model for lightweight work | No equivalent; `--small-model` is rejected for Claude | Minor | Document; use `CLAUDE_CODE_SUBAGENT_MODEL` if a session-wide default is wanted |
| Command `agent:` hard routing | The command executes in the named agent's context | The generated skill/command prepends an instruction to adopt the agent file; it is not hard routing | Material | Document; `claude --agent <name>` is the only hard routing |
| Colliding command bodies | The command body (guidance, steps) executes in the named agent's context | Dropped except `agent:` + `$ARGUMENTS`, which are folded into the generated skill; notably the `plan` command's body guidance is lost — the skill body carries the planning workflow instead | Material | The skill body already contains the workflow for colliding names; audit any future colliding command whose body adds guidance beyond its skill |
| Other OpenCode plugins | `session-tracker` and `token-counter` modules are installed under `.agents/plugins` | No `.agents/plugins/**` content is projected to Claude | Minor | Document; they are OpenCode-specific and not part of the issue |
| OpenCode config keys | `enabled_providers`, `model`, `small_model`, `share`, `permission.skill` | No generated Claude config file in v1 | Minor | Document; only `CLAUDE.md` and the agent/skill/command surface are generated |
| OpenCode-specific skill text | `compatibility: opencode`, `create-skill` wording, `ponytail-help` paths | Projected verbatim/copied; metadata is ignored by Claude | Minor | Audit and annotate the affected entries; keep `compatibility` as harmless metadata |
| Mixed-install freshness | `.agents/` is live for OpenCode/Kilo | Claude agents/commands/colliding skills are generated copies | Operational | Run `wfg install --runtime claude --force` after changing `base/**`; document in README |
| Windows skill links | Symlinks are available; junctions fall back | Skill-only entries link; if both fail, they are copied | Minor | Copy fallback keeps them working; record the mechanism used in the smoke |

Mitigations that are explicitly **not** in this decision: a managed `.claude/settings.json` with session-wide deny rules, a Claude hook port of the ponytail plugin, and a per-agent Claude model map. They are follow-ups because they change session-wide behavior or add a new configuration surface.

## Permission mapping

| OpenCode permission | Claude Code projection | Limitation |
| --- | --- | --- |
| `read: allow` | inherited read tools (`Read`, `Grep`, `Glob`) | none |
| `edit: allow` | `Edit`, `Write`, `NotebookEdit` + `permissionMode: acceptEdits` | `permissionMode` is ignored when the main conversation is in `bypassPermissions`, `acceptEdits`, or auto mode |
| `edit: ask` | `Edit`, `Write` + `permissionMode: default` | same main-conversation override caveat |
| `edit: deny` | omit edit tools + `disallowedTools: Edit, Write, NotebookEdit` | none |
| `question: allow` | `AskUserQuestion` in `tools` | removed from subagents; works when the agent runs as the main session |
| `task: deny` | omit `Agent` from `tools` | none |
| `task` allow-list | `tools: Agent(research, code, architect)` | list is ignored inside a subagent; enforced only with `claude --agent` |
| `bash` allow + deny prefixes | `Bash`/`PowerShell` in `tools` | per-command deny prefixes have no subagent equivalent; `disallowedTools: Bash(git push *)` would remove the whole Bash tool, not just that command; document as partial |
| `external_directory` deny | none | no per-subagent path rule; document as partial |
| `mode: primary/subagent` | no direct field; primary agents run via `claude --agent` | document invocation differences |
| `temperature` | no equivalent | omit; document |
| model selection | `model: inherit` by default; `--model <claude-alias-or-id>` pins every agent | OpenCode provider IDs (`openai/...`, `laberit/...`, `opencode-go/...`) are rejected for Claude; `--small-model` has no Claude equivalent |

The `temperature: 0.1` on `code` is intentionally dropped: Claude Code has no temperature control, and `effort` is not an equivalent. That is an accepted loss, not an invented mapping.

## Verification

**Automated evidence (agent, 2026-11-05, Windows host `Microsoft Windows NT 10.0.26300.0`):**

- `make check` green (typecheck, ESLint, Prettier, jscpd, full Vitest suite: 452 passed / 13 skipped).
- CLI-level install smoke from source: `npx tsx cli/src/index.ts install --repo <tmp> --runtime claude --no-track --skip-node-check --dry-run` predicted the full surface with no writes; the real install created 6 `.claude/agents/*.md`, 9 generated colliding skills, 6 `.claude/commands/*.md`, 4 skill-only entries as **junctions** (symlink unavailable on this host → junction fallback), and `CLAUDE.md` containing `@AGENTS.md`; `wfg uninstall` removed all managed files and links and cleaned `.claude/` and `CLAUDE.md`.

**Human smoke — pending.** Claude Code is not installed on this host (`claude --version` fails), so no Claude Code version or session observation is recorded and none is fabricated. The compatibility matrix stays `pending` for Claude until a maintainer runs:

```bash
claude --version
npx tsx cli/src/index.ts install --repo /tmp/wfg-claude --runtime claude --no-track --skip-node-check --dry-run
npx tsx cli/src/index.ts install --repo /tmp/wfg-claude --runtime claude --no-track --skip-node-check
cd /tmp/wfg-claude
claude
```

Inside the session check:

- `/agents` lists `planner`, `delivery`, `troubleshooter`, `research`, `code`, `architect`.
- `/skills` lists the wayforge skills; `/intent`, `/plan`, `/triage`, `/issue`, `/memory`, `/load-plan`, `/implement-task`, `/review-task`, `/ponytail-review`, `/ponytail-audit`, `/ponytail-debt`, and `/ponytail-gain` are invocable.
- `/memory` shows `CLAUDE.md` and `AGENTS.md`.
- `/intent` and `/plan` accept an argument (for example `/plan issue 293`) and the `$ARGUMENTS` text reaches the skill.
- A subagent invocation shows the expected tool restriction (for example `architect` cannot edit).
- With a default install, `/model` changes the session model and subagents follow it (`inherit`); with `--model sonnet`, `/tasks` shows the generated agents on Sonnet. Record which behavior was observed.
- `wfg uninstall --repo /tmp/wfg-claude` removes the managed surface and preserves a user-authored `.claude/agents/user.md`.

On Windows, additionally verify the skill link fallback (symlink or junction) and record the mechanism used. Record the Claude Code version, host, and observed output in `docs/compatibility-matrix.md`.

## Alternatives considered

- **Pointers only (like OpenCode/Kilo).** Rejected: Claude agent frontmatter must be translated (`tools`, `permissionMode`, `model`), and Claude merges commands into skills, so a pointer to `.agents/commands` would surface OpenCode frontmatter Claude cannot interpret and would still lose the collision policy.
- **Renaming commands or skills (for example `/wfg-plan`).** Rejected: renaming the command leaves the skill as `/plan`, so `/plan` still loses the command's `agent:` routing and the project gains a redundant name; renaming the skill keeps `/plan` as the command but forces every command body to reference the renamed skill and creates a non-obvious skill name. One entrypoint per name is smaller and keeps the user-facing contract.
- **Porting the ponytail plugin now.** Rejected for this issue: the plugin uses OpenCode-specific hooks (`experimental.chat.system.transform`, `command.execute.before`); a Claude hook port changes session-wide behavior and is a tracked follow-up, not part of Issue #293.

## Consequences

- Docs, the architecture memory, and the compatibility matrix must describe Claude as a projection runtime and keep its status `pending` until the human smoke is recorded.
- Claude agents, commands, and colliding skills are generated copies: after changing `base/**` in a mixed install, run `wfg install --runtime claude --force` to refresh them; symlinked skill-only entries update automatically.
- The human smoke remains a release gate: unit/integration tests alone never promote the matrix to `verified`.
- OpenCode and Kilo behavior is unchanged; all new behavior is behind `runtime === 'claude'`.

## Related

- ADR-0046 (Generic `.agents/` artifact directory with per-runtime pointers) — amended by Decisions 2 and 10 above.
- ADR-0009 (Unified Managed File Format) — the manifest tracking Claude generated files and skill links.
- ADR-0012 (agent topology / primary-subagent split) — the topology Claude's projection preserves through role lines and `claude --agent`.
- ADR-0014, ADR-0022, ADR-0031, ADR-0036, ADR-0041 — managed-file, reconciliation, cross-platform, and lifecycle conventions the projection reuses.
- Plan: `docs/ai/plans/2026-11-05_113638-issue-293-claude-runtime.md`
- Issue: #293
