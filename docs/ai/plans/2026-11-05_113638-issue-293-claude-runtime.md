---
status: in-progress
created: 2026-11-05
task: 5/5
required_gates:
  architect_review: true
  memory_update: true
---

# Claude Code runtime support (Issue #293) - Implementation plan

**Goal:** Add `claude` as a supported `wfg` runtime that projects the canonical `base/**` workflow into a native Claude Code surface (`.claude/agents`, `.claude/skills`, `.claude/commands`, `CLAUDE.md`) with translated permissions, idempotent managed-file lifecycle, dry-run preview, and uninstall.

**Architecture:** Keep `.agents/` as the single installed source tree (ADR-0046). OpenCode and Kilo keep their pointer/config model. Claude Code is a **projection runtime**: the six existing agents and the existing commands are generated as Claude-native files because their frontmatter must be translated; no new agent roles are introduced. Skills are exposed per skill through a symlinked skill folder (documented by Claude Code) with a copy fallback; memory is a generated `CLAUDE.md` that imports `AGENTS.md`. The projection is owned by one script/module, `cli/src/lib/claude.ts`, and driven from `doInstall`; `layout.ts` gains a runtime projection descriptor instead of assuming every runtime has both a generated config file and two pointer directories.

Generated `.claude/**` files are **build artifacts**, not a checked-in second source. There is no `base/claude/**` mirror and no duplicated agent/command/skill content in the repository. The script reads `base/**` (through `.agents/**` after installation) and writes the Claude projection at install time, exactly like `opencode.jsonc`/`kilo.jsonc` are generated output. The wayforge repository's own `.claude/` output is gitignored, like `.agents/`, `.opencode/`, and `.kilo/`. Reuse-first: the projection module composes the existing permission parser, managed-file helpers, and symlink helpers; it does not add a second YAML parser, a second manifest implementation, or a second pointer implementation.

**Tech Stack:** TypeScript CLI (Commander, fs-extra), vitest 4.x, existing symlink/junction helpers (`cli/src/lib/pointers.ts`), `base/permissions/agents.yml` as the permission source, `make check` for validation.

**Scope classification:** `multi-task`

**Task budget rationale:** 5 tasks. The work has five independently reviewable outcomes: runtime plumbing, agent projection, skills/commands projection, managed-file lifecycle, and documentation/smoke. Five avoids the 6-8 task confirmation gate while keeping the riskiest pieces (permission translation and collision-free command/skill projection) separate from lifecycle and docs. The real Claude Code smoke is a human gate inside Task 5, not a separate implementation task.

## Verified repository and external facts

- `Runtime` is `'opencode' | 'kilocode'` (`cli/src/types.ts`); `RUNTIMES` derives from `CONFIG_FILES` and `RUNTIME_POINTER_DIRS` assumes every runtime has a pointer root (`cli/src/lib/layout.ts`).
- `doInstall` always installs the `.agents/` tree, then generates one runtime config and ensures `.opencode`/`.kilo` pointers (`cli/src/commands/install.ts`). The reinstall path re-syncs manifest paths from `.agents` and regenerates configs.
- `base/agents/*.md` use OpenCode frontmatter (`description`, `mode`, `temperature` in `code.md`); permissions are injected from `base/permissions/agents.yml` by `cli/src/lib/permissions.ts`.
- `base/commands/*.md` use `description` + `agent:` frontmatter and `$ARGUMENTS` in 15 files. `base/skills/*/SKILL.md` use `name`, `description`, `compatibility`, `metadata`.
- Name collisions (verified 2026-11-05): 9 command/skill collisions (`intent`, `plan`, `triage`, `ponytail`, `ponytail-audit`, `ponytail-debt`, `ponytail-gain`, `ponytail-help`, `ponytail-review`), 6 command-only names (`implement-task`, `init`, `issue`, `load-plan`, `memory`, `review-task`), 4 skill-only names (`ai-memory`, `create-skill`, `memory-maintenance`, `shared-task`).
- Claude Code merges commands into skills; a `.claude/commands/foo.md` file and a `.claude/skills/foo/SKILL.md` both create `/foo`, and the skill wins when both exist (docs: `code.claude.com/docs/en/skills`). When a skill is invoked with arguments but has no `$ARGUMENTS` placeholder, Claude Code appends `ARGUMENTS: <value>` to the skill content, so the user's text is not lost. The real collision loss is the command's `agent:` routing, not the arguments.
- Claude Code agent files are `.claude/agents/*.md` with `name`, `description`, `tools`, `disallowedTools`, `model`, `permissionMode`, `skills`, `mcpServers`, `hooks`, `maxTurns`, `isolation`. `Agent(agent_type)` allow-lists apply only when the agent runs as the main session with `claude --agent`; inside a subagent the type list is ignored. `AskUserQuestion` is removed from every subagent. `permissionMode` is ignored when the main conversation is in `bypassPermissions`, `acceptEdits`, or auto mode. `disallowedTools` entries with a specifier such as `Bash(git push *)` remove the whole tool, not just the matching commands (docs: `code.claude.com/docs/en/sub-agents`).
- Claude Code reads `AGENTS.md` directly on v2.1.277+, but imports `@AGENTS.md` from `CLAUDE.md` for older versions and sessions where AGENTS.md support is unavailable. A project skill folder may be a symlink; Claude Code reads `SKILL.md` from the target (docs: `code.claude.com/docs/en/memory`, `.../skills`).
- Claude Code agent `model` accepts `sonnet`, `opus`, `haiku`, `fable`, a full Claude model ID, or `inherit`. It does **not** accept OpenCode provider IDs such as `openai/gpt-6-sol`, `github-copilot/...`, `laberit/...`, or `opencode-go/...`. `inherit` follows the main conversation's model; an explicit alias/ID pins that agent to it. Unlike OpenCode/Kilo, Claude Code has no provider config or per-agent model block: the only per-agent default is the agent file's `model` field, and session-wide subagent defaults use `CLAUDE_CODE_SUBAGENT_MODEL`.
- Claude Code permission limits are structural: subagent frontmatter cannot express OpenCode's per-command `bash` deny prefixes or `external_directory` rules. Those become documented partial mappings, not exact parity.
- Ponytail split: the **skills and commands are portable markdown** and can be projected to Claude. `/ponytail-review`, `/ponytail-audit`, `/ponytail-debt`, and `/ponytail-gain` are self-contained prompt workflows that do not need the plugin. The **plugin** (`base/plugins/ponytail/ponytail.mjs`) is OpenCode-specific: it uses `experimental.chat.system.transform` to inject the ladder into the system prompt and `command.execute.before` to persist intensity to `~/.config/opencode/.ponytail-active`. That plugin port stays out of scope; `/ponytail` mode switching becomes guidance-only in Claude, and `/ponytail-help` needs its OpenCode path wording adjusted or annotated.

## Cross-runtime projection matrix

The canonical `.agents/` tree is shared by all runtimes and is never modified per runtime. Only the native surface differs:

| Name type | OpenCode | Kilo Code | Claude Code |
| --- | --- | --- | --- |
| Colliding command + skill (9) | `.opencode/commands` pointer + `.opencode/agents` pointer; skills via `opencode.jsonc` | `.kilo/commands` pointer + `.kilo/agents` pointer; skills via `kilo.jsonc` | Generated `.claude/skills/<name>/SKILL.md` with role line and `$ARGUMENTS`; **no** `.claude/commands/<name>.md` |
| Command-only (6) | `.agents/commands/<name>.md` through the pointer | same through the `.kilo` pointer | Generated `.claude/commands/<name>.md` |
| Skill-only (4) | `.agents/skills/<name>/SKILL.md` via `opencode.jsonc` | same via `kilo.jsonc` | `.claude/skills/<name>` symlink to `.agents/skills/<name>` (copy fallback) |

The colliding command still exists in `.agents/commands/<name>.md`; OpenCode and Kilo keep using it. Claude omits only its native command projection because the skill would shadow it. The command's `agent:` routing and `$ARGUMENTS` are folded into the generated Claude skill, so the Claude `/name` entrypoint retains the same behavior.

Claude projection is additive and isolated: it writes only `.claude/**` and `CLAUDE.md` plus manifest entries. It never edits `base/**`, `.agents/**`, `opencode.jsonc`, `kilo.jsonc`, `.opencode/**`, or `.kilo/**`. Conversely, OpenCode/Kilo installs never touch `.claude/**` or `CLAUDE.md`. In a mixed install, the manifest can list both surfaces; `--force` for one runtime regenerates only that runtime's managed surface. Because generated Claude agents/commands/colliding skills are copies, changing `base/**` in a mixed install requires a Claude refresh (`wfg install --runtime claude --force`) to regenerate them; symlinked skill-only entries update automatically.

## What is lost or degraded in the Claude projection

This is the accepted-loss register for the ADR and the README "Known limitations" section. "Material" means it weakens a safety or behavior contract and needs explicit user-facing documentation; "minor" means it is a cosmetic or convenience difference.

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
| Other OpenCode plugins | `session-tracker` and `token-counter` modules are installed under `.agents/plugins` | No `.agents/plugins/**` content is projected to Claude | Minor | Document; they are OpenCode-specific and not part of the issue |
| OpenCode config keys | `enabled_providers`, `model`, `small_model`, `share`, `permission.skill` | No generated Claude config file in v1 | Minor | Document; only `CLAUDE.md` and the agent/skill/command surface are generated |
| OpenCode-specific skill text | `compatibility: opencode`, `create-skill` wording, `ponytail-help` paths | Projected verbatim/copied; metadata is ignored by Claude | Minor | Audit and annotate the affected entries; keep `compatibility` as harmless metadata |
| Mixed-install freshness | `.agents/` is live for OpenCode/Kilo | Claude agents/commands/colliding skills are generated copies | Operational | Run `wfg install --runtime claude --force` after changing `base/**`; document in README |
| Windows skill links | Symlinks are available; junctions fall back | Skill-only entries link; if both fail, they are copied | Minor | Copy fallback keeps them working; record the mechanism used in the smoke |

Mitigations that are explicitly **not** in this plan: a managed `.claude/settings.json` with session-wide deny rules, a Claude hook port of the ponytail plugin, and a per-agent Claude model map. They are follow-ups because they change session-wide behavior or add a new configuration surface.

## Reuse-first constraints (no duplicated source)

- **One projection module:** `cli/src/lib/claude.ts`. Agent, command, and skill projection live there; do not scatter Claude-specific logic across `install.ts`, `manifest.ts`, and `reconcile.ts`.
- **No `base/claude/**` mirror:** generate from `base/**` at install time. The generated `.claude/**` files are artifacts, not maintained source.
- **Reuse existing helpers:** `parseAgentPermissions` in `permissions.ts`, `syncManagedContent`/`managedTrackFile` in `manifest.ts`, and the symlink/copy logic in `pointers.ts`. Do not add a second YAML parser, manifest writer, or pointer implementation.
- **No new dependency:** the base agent/command frontmatter is simple enough for the existing line scanner; do not pull in a YAML library.
- **No per-runtime source trees:** `base/agents`, `base/commands`, and `base/skills` stay runtime-neutral. Claude differences are expressed by the projection, not by forking the source files.

## Tasks

### Task 1: Add the `claude` runtime contract and projection scaffolding

**Objective:** `wfg install --runtime claude` is accepted end-to-end and writes the Claude Code memory entrypoint (`CLAUDE.md`) from `base/AGENTS.md`, without touching the existing OpenCode/Kilo behavior.

**Files:**
- Modify: `cli/src/types.ts` - add `'claude'` to `Runtime`.
- Modify: `cli/src/lib/layout.ts` - make `RUNTIMES` explicit; make config files optional; make pointer paths runtime-specific and empty for Claude; add Claude surface constants (`.claude/agents`, `.claude/commands`, `.claude/skills`, `CLAUDE.md`).
- Modify: `cli/src/index.ts` - add `claude` to `--runtime` choices and help text; document that Claude Code manages authentication and that `--model` accepts a Claude alias/ID for Claude.
- Modify: `cli/src/commands/interactive.ts` - add `claude` to the runtime menu; skip the provider and model-preset prompts for Claude and explain that Claude Code manages authentication; offer an optional Claude model choice (`inherit` default, `sonnet`, `opus`, `haiku`, `fable`, or a full Claude model ID).
- Modify: `cli/src/lib/providers.ts` - skip provider validation for `claude` (do not reject the default `free-tier`); add Claude model validation (`sonnet`, `opus`, `haiku`, `fable`, `inherit`, or a `claude-*` model ID) and reject `--small-model` for Claude because Claude Code has no small-model concept.
- Create: `cli/src/lib/claude.ts` - `syncClaudeMemory(repo, sourceDir, ctx)` generating `CLAUDE.md` containing `@AGENTS.md` plus a one-line "generated by wayforge" note; no workflow rules duplicated.
- Modify: `cli/src/commands/install.ts` - branch the runtime-specific tail: OpenCode/Kilo keep config + pointers; Claude calls `syncClaudeMemory` for this task (agents/skills/commands arrive in Tasks 2-3), and passes the resolved Claude model (`--model` or `inherit`) to the later projection.
- Modify: `cli/tests/unit/source-dir.test.ts` or `cli/tests/unit/pointers.test.ts` only if the layout API change requires it.
- Modify: `cli/tests/integration/install-layout.test.ts` - add a Claude case asserting `CLAUDE.md` exists, no `opencode.jsonc`/`kilo.jsonc` is created, and `.agents/` is still installed.
- Validate: `cli/tests/unit/*`, `cli/tests/integration/install-layout.test.ts`.

**Step 1: Establish expected behaviour**

`wfg install --repo <tmp> --runtime claude --dry-run` must be accepted and describe the planned actions without writing. A real install must still create the canonical `.agents/` tree and `AGENTS.md`, plus a managed `CLAUDE.md` whose content imports `@AGENTS.md`. It must not create `.opencode/`, `.kilo/`, `opencode.jsonc`, or `kilo.jsonc`. `--providers` is ignored for Claude; `--model sonnet|opus|haiku|fable|claude-*|inherit` is accepted and `--small-model` is rejected with a clear message. Existing `--runtime opencode|kilocode` output must be byte-identical to the current tests.

**Step 2: Add or update validation**

Add a Claude runtime case to `cli/tests/integration/install-layout.test.ts` that calls `doInstall(installOptions(repo, 'claude'))` and asserts:
- `.agents/agents/planner.md`, `.agents/skills/intent/SKILL.md`, `.agents/commands/init.md` exist;
- `CLAUDE.md` exists and contains `@AGENTS.md`;
- `opencode.jsonc` and `kilo.jsonc` do not exist;
- `.opencode` and `.kilo` pointer paths do not exist;
- `--model sonnet` is accepted and `--model openai/gpt-6-sol` is rejected for Claude;
- `--small-model` is rejected for Claude.

Add a unit assertion for `RUNTIMES` including `claude`, `configFileFor('claude') === null`, and `pointerPathsFor('claude')` being empty.

**Step 3: Write minimal implementation**

In `layout.ts`, replace the config-derived `RUNTIMES` with an explicit tuple and make `configFileFor` return `string | null` (or add `configPathFor`). Keep `RUNTIME_POINTER_DIRS` only for runtimes that use pointers and make `pointerPathsFor` return `[]` for Claude. Add:
```ts
export const CLAUDE_ROOT = '.claude'
export const CLAUDE_AGENT_DIR = '.claude/agents'
export const CLAUDE_COMMAND_DIR = '.claude/commands'
export const CLAUDE_SKILLS_DIR = '.claude/skills'
export const CLAUDE_MEMORY_FILE = 'CLAUDE.md'
```
In `claude.ts`, write `CLAUDE.md` through `writeFile`/`syncManagedContent` (add `syncManagedContent` in `manifest.ts` if Task 4 has not added it yet; the smallest version writes the file and calls `managedTrackFile`). In `doInstall`, parse providers only for non-Claude runtimes; generate the config only when `configFileFor(runtime)` is non-null; call `syncClaudeMemory` for Claude. Resolve the Claude model once (`options.model ?? 'inherit'`), validate it with the Claude-specific validator, and store it on the install options so Task 2 can write it to every generated agent. If `options.smallModel` is set for Claude, exit with a clear error instead of silently ignoring it.

**Step 4: Run test to verify pass**

Run: `npx vitest run cli/tests/integration/install-layout.test.ts cli/tests/unit`
Expected: all existing tests pass; the new Claude case passes; no config/pointer files for Claude.

**Step 5: Commit**

`git add cli/src/types.ts cli/src/lib/layout.ts cli/src/index.ts cli/src/commands/interactive.ts cli/src/lib/providers.ts cli/src/lib/claude.ts cli/src/commands/install.ts cli/tests`
`git commit -m "feat: add claude runtime contract (Issue #293)"`

---

### Task 2: Project agents with translated frontmatter and permissions

**Objective:** Project the six **existing** wayforge agents (`planner`, `delivery`, `research`, `code`, `troubleshooter`, `architect`) into valid Claude Code subagent files. No new agent roles are introduced; this task only translates the frontmatter of the agents already defined in `base/agents/*.md`, producing `name`, `description`, `tools`, `disallowedTools`, `model` (`inherit` by default or the installer-selected Claude model), and `permissionMode` derived from `base/permissions/agents.yml`.

**Files:**
- Modify: `cli/src/lib/permissions.ts` - add a structured `parseAgentPermissions(agentName, permissionsFile)` returning `read`, `edit`, `question`, `bash`, `externalDirectory`, `task`; keep `renderAgentPermissionBlock` behavior unchanged.
- Modify: `cli/src/lib/claude.ts` - add `renderClaudeAgent(...)` and `syncClaudeAgents(...)`.
- Create: `cli/tests/unit/claude.test.ts` - agent translation table.
- Modify: `cli/tests/integration/install-layout.test.ts` - assert six `.claude/agents/*.md` files and their frontmatter.
- Validate: `cli/tests/unit/claude.test.ts`, `cli/tests/integration/install-layout.test.ts`.

**Step 1: Establish expected behaviour**

For each `base/agents/<name>.md`, Task 2 produces `.claude/agents/<name>.md`:
- `name: <name>`; `description` copied verbatim; `model` is the installer-selected Claude model (`--model` value) or `inherit` when no override is provided. `inherit` means the agent follows the main conversation's model; an explicit alias/ID pins it.
- `permissionMode: acceptEdits` only for `edit: allow` (`code`); `default` for `edit: ask`/`deny`.
- `tools`: base tool set `Read, Grep, Glob, Bash, PowerShell, WebFetch, WebSearch, Skill, TodoWrite`; add `Edit, Write` when edit is allowed/ask; add `NotebookEdit` only for `edit: allow`; add `AskUserQuestion` when `question: allow`; add `Agent` when `task` is not denied; use `Agent(research, code, architect)` for planner/delivery allow-lists.
- `disallowedTools: Edit, Write, NotebookEdit` for `architect` (`edit: deny`).
- No OpenCode-only fields (`mode`, `permission`, `temperature`, `task`) remain in the generated file.

Expected generated frontmatter (default `model: inherit`):

| Agent | `tools` | `disallowedTools` | `permissionMode` |
| --- | --- | --- | --- |
| `planner` | `Read, Grep, Glob, Bash, PowerShell, WebFetch, WebSearch, Skill, TodoWrite, AskUserQuestion, Edit, Write, Agent(research, code, architect)` | - | `default` |
| `delivery` | `Read, Grep, Glob, Bash, PowerShell, WebFetch, WebSearch, Skill, TodoWrite, AskUserQuestion, Edit, Write, Agent(research, code, architect)` | - | `default` |
| `troubleshooter` | `Read, Grep, Glob, Bash, PowerShell, WebFetch, WebSearch, Skill, TodoWrite, AskUserQuestion, Edit, Write` | - | `default` |
| `research` | `Read, Grep, Glob, Bash, PowerShell, WebFetch, WebSearch, Skill, TodoWrite, Edit, Write` | - | `default` |
| `code` | `Read, Grep, Glob, Bash, PowerShell, WebFetch, WebSearch, Skill, TodoWrite, Edit, Write, NotebookEdit` | - | `acceptEdits` |
| `architect` | `Read, Grep, Glob, Bash, PowerShell, WebFetch, WebSearch, Skill, TodoWrite` | `Edit, Write, NotebookEdit` | `default` |

Notes: `AskUserQuestion` is stripped by Claude Code for subagents but remains useful when the agent runs as the main session via `claude --agent`. `Agent(research, code, architect)` is enforced only in that main-session mode; in subagent mode the type list is ignored. `Bash`/`PowerShell` stay broad because per-command deny prefixes cannot be expressed per subagent; that gap is documented in the ADR.

**Step 2: Add or update validation**

Add a parameterized Vitest table for the six agents. Assert exact `tools`/`disallowedTools`/`permissionMode` values, absence of `mode:`/`permission:`/`temperature:`, that `description` matches the source, and that `model` is `inherit` by default and the selected alias/ID when the installer passes one. Add a regression case that `architect` cannot edit and `code` uses `acceptEdits`.

**Step 3: Write minimal implementation**

Implement a minimal frontmatter reader for the fields the base agents use (`description`, `mode`, `temperature`). Reuse `renderAgentPermissionBlock`'s line scanning by extracting a shared parser; do not add a YAML dependency. Build the tools list from the parsed permission structure, not a hardcoded per-agent table, so a permissions edit changes the generated surface. Strip `permission:` blocks from the source body before emitting it, and preserve the body markdown unchanged otherwise. Track generated files with the managed-file helper.

**Step 4: Run test to verify pass**

Run: `npx vitest run cli/tests/unit/claude.test.ts cli/tests/integration/install-layout.test.ts`
Expected: all six generated agents match the table; existing permission tests still pass.

**Step 5: Commit**

`git add cli/src/lib/permissions.ts cli/src/lib/claude.ts cli/tests`
`git commit -m "feat: project claude agents and permissions (Issue #293)"`

---

### Task 3: Project skills and commands with a collision-free policy

**Objective:** Expose the wayforge skills and user-invocable entrypoints to Claude Code without the skill-vs-command shadowing problem, preserving the intended agent role and the user's argument text.

**Files:**
- Modify: `cli/src/lib/claude.ts` - add `projectedSkillNames()`, `renderClaudeSkill(...)`, `renderClaudeCommand(...)`, `syncClaudeSkillsAndCommands(...)`.
- Modify: `cli/src/lib/layout.ts` - add `CLAUDE_*` path helpers used by the projection.
- Create/extend: `cli/tests/unit/claude.test.ts` - skill/command projection table.
- Modify: `cli/tests/integration/install-layout.test.ts` - assert `.claude/skills` and `.claude/commands` contents.
- Validate: `cli/tests/unit/claude.test.ts`, `cli/tests/integration/install-layout.test.ts`.

**Step 1: Establish expected behaviour**

Adopt a **skill-first collision policy**. The problem is not argument loss (Claude Code appends `ARGUMENTS: <value>` when no placeholder exists); it is that the skill wins over the command file, so the command's `agent:` routing is lost. The policy keeps one entrypoint per name and re-attaches the intended agent role:
- For the 9 colliding names, generate `.claude/skills/<name>/SKILL.md` from the base skill and **do not** generate `.claude/commands/<name>.md`. Prepend a role line when the base command declares `agent:`: `Act as the <agent> agent. Read .claude/agents/<agent>.md and follow its instructions.` Add an explicit `## Additional scope or clarification` section containing `$ARGUMENTS` so the argument lands in a predictable place; without it Claude Code still appends `ARGUMENTS: <value>`.
- For the 6 command-only names, generate `.claude/commands/<name>.md` with the source `description`, the role line when `agent:` is present, and the source body including `$ARGUMENTS`.
- For the 4 skill-only names, expose `.claude/skills/<name>` as a relative symlink to `../../.agents/skills/<name>`; if symlink creation fails, copy the skill tree and track the copied files.
- Never emit a command file and a skill directory with the same name.

Renaming was considered and rejected as the primary policy: renaming the command (for example `/wfg-plan`) leaves the skill as `/plan`, so `/plan` still loses the command's `agent:` routing and the project gains a second, redundant name; renaming the skill (for example `/wfg-plan`) keeps `/plan` as the command but forces every command body to reference the renamed skill and creates a non-obvious skill name. Emitting exactly one entrypoint per name is smaller and keeps the user-facing contract.

**Step 2: Add or update validation**

Add a unit table that asserts:
- `intent`, `plan`, `triage`, `ponytail*` produce `.claude/skills/<name>/SKILL.md` containing `$ARGUMENTS` and the `Act as the <agent> agent` role line, with no `.claude/commands/<name>.md`;
- `init`, `issue`, `memory`, `load-plan`, `implement-task`, `review-task` produce `.claude/commands/<name>.md` and no matching skill directory;
- `ai-memory`, `create-skill`, `memory-maintenance`, `shared-task` produce skill entries pointing at `.agents/skills`;
- no command/skill name appears in both locations.

In the integration test, assert the exact set of generated command files and skill directories, and that `CLAUDE.md` still imports `AGENTS.md`.

**Step 3: Write minimal implementation**

Build the collision set from `base/commands/*.md` and `base/skills/*/SKILL.md` at install time, not from a hardcoded list, so new commands/skills follow the same rule. For symlinked skills, reuse the relative-link helper from `pointers.ts` and the copy fallback; do not probe symlinks in dry-run. Keep generated skill content managed so `--force` refreshes it. Do not project the ponytail plugin; record it as out of scope in the ADR.

**Step 4: Run test to verify pass**

Run: `npx vitest run cli/tests/unit/claude.test.ts cli/tests/integration/install-layout.test.ts`
Expected: the collision table passes; no duplicate command/skill names; `$ARGUMENTS` present in colliding skills.

**Step 5: Commit**

`git add cli/src/lib/claude.ts cli/src/lib/layout.ts cli/tests`
`git commit -m "feat: project claude skills and commands (Issue #293)"`

---

### Task 4: Integrate the Claude surface with the managed-file lifecycle

**Objective:** Fresh install, reinstall, `--force`, `--dry-run`, conflict handling, stale-file pruning, and `wfg uninstall` all respect the managed-file contract for Claude generated files and skill links.

**Files:**
- Modify: `cli/src/commands/install.ts` - fresh and reinstall branches for Claude; skip `.claude/` paths in the manifest re-sync loop; call the Claude projection; prune stale generated Claude paths.
- Modify: `cli/src/lib/manifest.ts` - add `syncManagedContent(dst, content, ctx)`; guard `syncManagedPathFromManifest` for `.claude/` and `CLAUDE.md`; track symlinked skill directories.
- Modify: `cli/src/lib/reconcile.ts` - `findUnmanagedConflicts(repo, sourceDir, runtime)` includes Claude destinations so user-authored `.claude` files are not silently overwritten.
- Modify: `cli/src/lib/claude.ts` - export `expectedClaudePaths(sourceDir)` and `pruneStaleClaudePaths(repo, expected, ctx)`.
- Modify: `cli/tests/integration/install-layout.test.ts` - reinstall/force/dry-run/uninstall cases.
- Modify: `cli/tests/unit/uninstall.test.ts` - Claude manifest paths and a symlinked skill directory.
- Modify: `cli/tests/unit/reconcile.test.ts` - Claude conflict case.
- Validate: `npx vitest run cli/tests/unit cli/tests/integration`, then `make check`.

**Step 1: Establish expected behaviour**

- Reinstall is idempotent: no duplicate manifest entries, no rewritten files when content is unchanged, and generated files are refreshed when the source changes.
- `--force` regenerates all managed Claude files and replaces managed skill links; it never overwrites unmanaged `.claude` content.
- `--dry-run` performs no writes, no symlink capability probe, and predicts the same blocked/residual paths a real run would report.
- A user-authored `.claude/agents/user.md`, `.claude/commands/user.md`, or `.claude/skills/user/SKILL.md` is preserved.
- Removing an agent/command/skill from `base/**` removes its managed Claude projection on the next install without deleting unmanaged siblings.
- `wfg uninstall` removes generated Claude files, `CLAUDE.md`, and skill links tracked in the manifest, then cleans empty directories up to the repo root.
- OpenCode/Kilo installs are unaffected by the new branches.

**Step 2: Add or update validation**

Add integration cases:
1. install Claude twice; assert stable manifest and file contents;
2. install, edit `.claude/agents/planner.md`, reinstall with `--force`, assert the generated content is restored;
3. install, add an unmanaged `.claude/agents/user.md`, reinstall, assert it survives;
4. dry-run into an empty repo, assert no `.claude/`/`CLAUDE.md` files exist;
5. uninstall, assert generated Claude files and links are gone and `AGENTS.md`/user files remain;
6. mixed install: install OpenCode, then Claude; assert the OpenCode config/pointers are unchanged, then install OpenCode with `--force` and assert the Claude surface is unchanged, then install Claude with `--force` and assert the OpenCode surface is unchanged.

Add a unit test for stale pruning and a uninstall test for a symlinked skill directory (and the junction/`EPERM` fallback on Windows).

**Step 3: Write minimal implementation**

Add `syncManagedContent` next to `syncManagedFile`, sharing the same managed/force/override checks. In the reinstall branch, skip `.claude/` and `CLAUDE.md` in the generic manifest loop, then call `syncClaudeSurface` once; compute expected paths and prune manifest entries that no longer exist in `base/**`. In `uninstall.ts`, no special-case is needed for generated files, but verify `rm` handles a symlinked skill directory and that empty-directory cleanup does not climb past the repo. In `reconcile.ts`, pass the selected runtime and check Claude destinations before writing. Keep all new behavior behind `runtime === 'claude'`; do not change the OpenCode/Kilo path.

**Step 4: Run test to verify pass**

Run: `npx vitest run cli/tests/unit cli/tests/integration`
Then: `make check`
Expected: all tests, typecheck, lint, format, and duplication pass.

**Step 5: Commit**

`git add cli/src/commands/install.ts cli/src/lib/manifest.ts cli/src/lib/reconcile.ts cli/src/lib/claude.ts cli/tests`
`git commit -m "feat: manage claude runtime lifecycle (Issue #293)"`

---

### Task 5: Document the runtime, record the ADR, update the matrix, and run the human smoke

**Objective:** The public docs, architecture memory, ADR, and compatibility matrix describe Claude Code support accurately, and a real Claude Code session verifies the installed surface.

**Files:**
- Modify: `README.md` - runtime table and install examples (`--runtime claude`), Claude Code auth note, `--providers` ignored behavior, `--model` accepting Claude aliases/IDs (`inherit` default; `--small-model` rejected), and a **Known limitations / what is lost** section covering the accepted-loss register below.
- Modify: `docs/ai/architecture.md` - Runtime Boundary, Installed Surface, a Claude Code projection subsection, the cross-runtime matrix, and invariants.
- Modify: `docs/compatibility-matrix.md` - add a Claude Code column for Agents, Commands, Skills, Memory, Plugins, pointer/projection mechanism, and the loss status per artifact.
- Create: `docs/ai/decisions/ADR-0048-claude-code-runtime-projection.md` - runtime name, projection model, collision policy, `CLAUDE.md` import, permission mapping table, the full accepted-loss register, partial-permission limitations, skill link/copy fallback, and the ponytail plugin out-of-scope split.
- Modify: `docs/ai/logs/2026-11.md` - closeout entry (or let `/memory close-check` own it).
- Validate: human smoke (below) plus `make check`.

**Step 1: Establish expected behaviour**

Docs must let a maintainer answer: which runtimes exist; what each installs; why Claude gets generated files instead of pointers; how permissions map; **what is lost or degraded** (the accepted-loss register above); how to uninstall; and how to reproduce the verification. The compatibility matrix must not claim `verified` before the human smoke; use `pending` until the smoke evidence is recorded.

**Step 2: Add or update validation**

Human-owned smoke, with the exact Claude Code version recorded:
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

On Windows, additionally verify the skill link fallback (symlink or junction) and record the mechanism used.

**Step 3: Write minimal implementation**

Draft docs from the verified behavior, not from the implementation's intentions. Copy the "What is lost or degraded in the Claude projection" register into the ADR and summarize the material rows in the README "Known limitations" section. In the ADR, also include a permission mapping table like:

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

Record the collision policy and the `CLAUDE.md` `@AGENTS.md` import. Keep the ponytail **skills/commands** in the Claude projection: `/ponytail-review`, `/ponytail-audit`, `/ponytail-debt`, and `/ponytail-gain` are self-contained prompt workflows and work without the plugin. Mark only the **plugin port** as a follow-up, out of scope per Issue #293. Document that `/ponytail` mode switching becomes guidance-only in Claude (no `command.execute.before` persistence and no `experimental.chat.system.transform` injection), and that `/ponytail-help` must drop or annotate its `~/.config/opencode/.ponytail-active` lines. Also audit the other projected skill/command text for OpenCode-specific wording: `compatibility: opencode` (Claude ignores it, harmless) and OpenCode-specific phrasing in `create-skill`; decide per item whether to keep it as-is, annotate it in the Claude projection, or exclude that entry from Claude.

The `temperature: 0.1` on `code` is intentionally dropped: Claude Code has no temperature control, and `effort` is not an equivalent. Record that as an accepted loss rather than inventing a mapping.

**Step 4: Run test to verify pass**

Run: `make check`
Expected: green. Then run the human smoke above and record the Claude Code version, host, and observed output in the compatibility matrix.

**Step 5: Commit**

`git add README.md docs/ai/architecture.md docs/compatibility-matrix.md docs/ai/decisions/ADR-0048-claude-code-runtime-projection.md docs/ai/logs/2026-11.md`
`git commit -m "docs: document claude runtime support (Issue #293)"`

## Decisions (confirmed 2026-11-05)

1. **Runtime name:** `claude`.
2. **Command/skill collision policy:** skill-first. Colliding names become generated Claude skills; command-only names become `.claude/commands/*.md`; no name is emitted twice. The canonical `.agents/commands/<name>.md` stays for OpenCode/Kilo.
3. **Permission parity:** map the exact cases and document the partial/absent ones. `bash` deny prefixes and `external_directory` remain partial; `temperature` and `mode` are documented losses.
4. **Model behavior:** `model: inherit` by default; optional `--model <claude-alias-or-id>` pins every generated agent. `--providers` is ignored for Claude and `--small-model` is rejected.
5. **Target Claude Code version:** record the installed `claude --version` (current docs cover v2.1.309) in the PR and matrix.

## Ponytail decision (confirmed 2026-11-05)

- **Project ponytail with a limitation note.** `/ponytail-review`, `/ponytail-audit`, `/ponytail-debt`, and `/ponytail-gain` are projected as normal prompt workflows and are smoke-tested. `/ponytail` remains guidance-only in Claude (no persistence and no system-prompt injection), and `/ponytail-help` gets its OpenCode path wording adjusted or annotated. Only the plugin port (`ponytail.mjs` hooks) is out of scope.

## Required gates

- **Architect review (`architect_review: true`).** The change adds a projection runtime and changes `layout.ts`'s assumption that every runtime has a config file and pointer directories. ADR-0048 must be reviewed against ADR-0046, ADR-0031, and ADR-0012.
- **Memory update (`memory_update: true`).** Update `docs/ai/architecture.md`, `docs/compatibility-matrix.md`, ADR-0048, and the monthly log at close.
- **Human smoke.** Do not mark the compatibility matrix `verified` from unit/integration tests alone. A real Claude Code session on a recorded version must exercise agents, skills, commands, memory, permissions, and uninstall.
- **`make check`.** Typecheck, lint, format, duplication, and the full Vitest suite must pass before review.
- **No source/runtime regressions.** OpenCode and Kilo install, pointer, config, migration, and uninstall tests must remain unchanged and green.

## Out of scope (per Issue #293)

- Porting the ponytail **plugin** (`ponytail.mjs`, OpenCode hooks) to Claude Code hooks. The ponytail **skills/commands** are projected as normal Claude skills; `/ponytail-review` in particular is in scope and expected to work.
- Configuring Anthropic authentication or provider selection. (Selecting a Claude model alias/ID via `--model` is in scope; configuring OpenCode/Kilo providers for Claude is not.)
- Claude Code background agents, agent teams, MCP, or plugin parity.
- Changing OpenCode, Kilo Code, or Pi behavior.
- Materializing the entire `.agents/` tree for every runtime; this plan materializes only the Claude-specific projection.
