---
status: planned
created: 2026-10-22
updated: 2026-11-02
task: 0/7
sequence: B
issue: 279
parent_issue: 226
depends_on: 2026-11-02_141731-issue-226-plan-a-opencode-v2-foundation.md
deferred_until: Plan A lands
required_gates:
  architect_review: true
  memory_update: true
---

# OpenCode V2 migration (Plan B, deferred) — Issue #226

**Tracking:** GitHub issue #279, child of #226. Blocked until Plan A (#278) lands and this outline is re-planned.

> **Deferred. Do not implement Plan B yet.**
> Plan A (`docs/ai/plans/2026-11-02_141731-issue-226-plan-a-opencode-v2-foundation.md`) must land first. This document preserves the verified context, the agreed migration decisions, and the seven-task scope. It is **not** an executable task plan yet: the seven tasks below are an outline to be expanded into bite-sized tasks after Plan A is merged and re-verified.

**Goal:** Make `--runtime opencode` emit native OpenCode 2.x artifacts into the post-#227 `.agents/` layout while `--runtime kilocode` keeps emitting the V1-shaped artifacts that Kilo Code 1.x accepts, and reject an unsupported OpenCode version before any install mutation.

**Architecture:** Consume the `RuntimeShape` descriptor added by Plan A (`cli/src/lib/layout.ts`) instead of hardcoded `runtime === 'opencode'` conditionals. Plan B changes config emission, permission rendering, plugin entrypoints, and install/update wiring; Plan A already supplies the descriptor, the version gate, the offline schema harness, and the runtime-aware stale-config rule. Kilo Code stays on the V1 shape because its current runtime and plugin API are V1.

**Tech Stack:** TypeScript, Node.js >= 18, Commander, fs-extra, vitest, `ajv` 8 (draft 2020-12) as a CLI dev dependency, `make check`.

**Scope classification:** `multi-task` (seven tasks). When this outline is expanded, 6-8 tasks require explicit user confirmation of the task budget under the `plan` skill before implementation handoff.

## Why this is a separate plan

Plan A is deliberately emission-neutral. It adds a descriptor, a version preflight, a schema fixture/harness, and an unwired stale-config function without changing any generated artifact. Plan B is the migration: it changes the config key names, permission frontmatter, plugin entrypoints, and install/update flow.

Splitting them avoids an unstable intermediate release. A native V2 `opencode.jsonc` that names `./.agents/plugins/...` directories is only valid once the V2 plugin entrypoints and package `exports` exist. Plan A can land and ship safely while generation still emits the current V1 shape; Plan B then flips emission, runtime behavior, and the documentation together.

## Kilo Code impact

"V2" in this plan means OpenCode 2.x only. Kilo Code V2 has not shipped at the time of planning; Plan B keeps Kilo on its current V1 contract.

- `kilocode` keeps singular config keys, the `https://app.kilo.ai/config.json` schema, `"skills": ["./.agents/skills"]`, and file-based `"plugin"` entries. Only `opencode` changes shape.
- The Kilo V1 output gets a snapshot/equality test so the OpenCode migration cannot drift it.
- Kilo keeps the V1 `permission:` map. The ordered `{ action, resource, effect }` list is OpenCode-only.
- `.kilo/agents` and `.kilo/commands` pointers are unchanged from #253.
- Plugin packages keep `main` for V1; the new `exports` field is for OpenCode V2 directory resolution. Kilo config names the V1 file directly, so `exports` should be inert, but a Kilo 7.8.x human smoke test is required.
- Two accepted Kilo-visible changes: every shipped plugin is now listed explicitly (fixing the loss of `.opencode/plugins/` auto-discovery), and `temperature: 0.1` is removed from the shared `code.md`.
- Kilo V2 migration is tracked by issue #277 and in `docs/ai/plans/2026-11-02_142844-kilo-code-v2-migration.md`; it is blocked until Kilo ships V2.

## Revision history

- **2026-10-27:** the plan moved off `.opencode/**` output and `base/opencode/**` source paths because PR #253 (Issue #227) moved every installed artifact to `.agents/**` and flattened the source tree to `base/**`. The old plugin shape `{"package": "./.../ponytail.v2.mjs"}` was rejected because V2 requires a local plugin entry to name a directory, not a file.
- **2026-11-02:** re-checked against `develop` at `fcb46d4`. #227 and #248 are merged (`8589948`, `ce40dbf`); #231/#255 is deferred by maintainer decision; `@opencode/cli` and `@opencode/plugin` are 2.2.5 and `opencode-ai` is 1.19.5; the local `opencode --version` is 1.19.5; PR #274 (#239) adds a fourth plugin conditionally; the five-step plan contract remains because #255 has not landed.
- **2026-11-02 (this revision):** split Issue #226 into Plan A (foundation, active) and Plan B (migration, deferred). The verified context below is unchanged; only the delivery sequencing changed.

## Sequencing decisions and required gates

1. **Sequencing decision (2026-11-02): #226 lands before #255.** #227 and #248 are closed and #253/#254 are merged. #231 remains open, but the maintainer has deferred #255 so it does not block this plan. Do not wait for #255. The `status:blocked` label should be removed; the GitHub dependency list already omits #231.
2. **Implementation order.** #253 and #254 are on `develop`; the branch already contains them. Plan A lands first. After Plan A merges, re-plan and implement Plan B. After #226 merges, #255 rebases onto the result and adapts its agent-set, permission-fixture, and plan-format changes. Do not resolve future conflicts by reintroducing `.opencode` paths; #255's plan-format changes apply after its rebase.
3. **Kilo Code routing is resolved by #253, not by this issue.** #253 adds `.kilo/agents` and `.kilo/commands` pointers and points the Kilo plugin/skills config at `.agents/**`, verified against Kilo 7.8.17. This issue therefore does not reopen the `.kilo/**` output-root work. If #253 is rejected, #226 must either absorb that routing fix or remain blocked; that is a maintainer decision.
4. **Plugin strategy: separate V1 and V2 entrypoints plus a directory-resolvable package.** V2 config entries must name plugin directories. Each plugin package keeps `main` for V1 and adds `exports` for V2. The alternative "one module exports both `Plugin.define` and `server`" is rejected because it forces V1 hosts to resolve `@opencode/plugin` at module load.
5. **Integration coverage is vitest, not `run.sh`.** #253 deletes `cli/tests/integration/run.sh` and removes `check-integration`; #254 also rewrites that script. This plan extends the #253 helper (`cli/tests/helpers/install.ts`) and adds a vitest integration test under `cli/tests/integration/`. Do not resurrect the legacy comparison harness.
6. **Version is a release-scheduling decision, not a code dependency.** `VERSION` is `1.0.2` on `develop`, `main`, and the working tree. No open PR bumps it to `1.1.0`; #254's `VERSION` diff removes a trailing newline only. If maintainers intend #227 + #226 to ship together as `1.1.0`, #226 must land before release prep updates `VERSION`, `CHANGELOG.md`, and the tag. Otherwise it ships in the next minor. Do not gate implementation on a `VERSION` value; the only version gate in code is the OpenCode major gate.
7. **Architect review is required before implementation.** It must accept (a) V2-only for `--runtime opencode`, (b) the OpenCode major preflight, (c) the plugin directory + `exports` layout, (d) the `.agents` config paths, and (e) the shape-stale regeneration rule. If the architect rejects the `.agents` pointer approach, re-plan after #253.
8. **Human validation is required before closure.** Unit and vitest checks cannot prove runtime discovery through symlink/junction pointers or plugin loading. Required: OpenCode `@opencode/cli@2.2.5` on one host (agents, commands, skills, the shipped plugin set) and Kilo `7.8.x` on one host (V1 shape still loads).

## Plan A handoff contract

Plan B assumes Plan A has landed with these exports and behaviors:

| Plan A artifact | What Plan B relies on |
|---|---|
| `cli/src/lib/layout.ts` — `RuntimeShape`, `RUNTIME_SHAPES`, `schemaUrlFor`, `pluginEntriesFor` | Config generation and install/update read shape data from one place |
| `RUNTIME_SHAPES.opencode.keys` = `agents` / `providers` / `plugins` / `permissions` | Native V2 key emission |
| `RUNTIME_SHAPES.opencode.pluginEntries` = three plugin directories (four if #274 merged) | V2 `plugins` array |
| `RUNTIME_SHAPES.opencode.minimumOpenCodeMajor` = 2 | Version gate already wired |
| `cli/src/lib/runtime-version.ts` — `assertRuntimeSupported` | No further gate work in Plan B |
| `cli/tests/fixtures/opencode-v2-config.schema.json` + `cli/tests/helpers/schema.ts` | Validate every generated V2 config sample offline |
| `cli/src/lib/config-gen.ts` — `isRuntimeConfigStale(runtime, file)` | Wire into install/update after V2 emission lands |
| `PLUGIN_ENTRY` still the ponytail V1 file entry | Existing V1 output remains until Plan B changes it |

If any of these differ when Plan B is re-planned, update this document before expanding tasks. In particular, `isRuntimeConfigStale` must not be wired into install until Plan B Task 1 changes emission; otherwise a refresh regenerates the current V1 shape and immediately classifies it stale, breaking idempotency.

## Verified context (2026-10-27; versions re-checked 2026-11-02)

### Upstream

- OpenCode V2 ships as `@opencode/cli@2.2.5` (latest at verification); the V1 line ships as `opencode-ai@1.19.5`. The V2 plugin SDK is `@opencode/plugin@2.2.5`. The local workstation has `opencode --version` = `1.19.5`, so local installs must set `WAYFORGE_OPENCODE_VERSION` or install the V2 CLI.
- V2 docs: <https://opencode.ai/v2/docs/>. Relevant pages: `config`, `agents`, `commands`, `skills`, `permissions`, `plugins`, `build/plugins`, `build/plugins/migrate-v1`.
- V2 native top-level keys: `agents`, `providers`, `plugins`, `permissions`, `commands`, `skills`. The V2 schema still accepts the V1 singular keys as deprecated aliases, so **schema acceptance alone cannot prove the native shape**. Tests must assert key presence/absence explicitly.
- V2 `enabled_providers` and `small_model` remain accepted but are marked `deprecated: true` in the live schema. They are used today; removing/replacing them is out of scope.
- V2 permission rules are `{ action, resource, effect }`, last match wins. `bash` becomes `shell`; `task` becomes `subagent`; `permission` becomes `permissions`.
- V2 agent frontmatter rejects `temperature`, `top_p`, `prompt`, `permission`, `tools`, `disable`, and `maxSteps`. `mode: primary|subagent|all` remains valid; `steps` replaces `maxSteps`.
- V2 plugin implementations do not run in the V1 shape. A V2 plugin default-exports `Plugin.define({ id, setup(ctx) })`; V1 exports `server()`.
- **V2 local plugin entries must name directories.** A configured local path that names a single file is skipped. A local plugin directory with `package.json` `name` + `exports` loads through `exports`; without those, V2 falls back to root files named `server` (else `index`) with `.ts`/`.tsx`/`.js`.
- V2 auto-discovers direct files and immediate package directories under `.opencode/plugins/`. It does **not** auto-discover `.agents/plugins/`. Therefore every shipped plugin must be listed in the V2 `plugins` array when the artifact tree is `.agents/`.
- V2 discovers project skills from `.opencode/skills` and from compatibility paths `.claude/skills` and `.agents/skills`. Agents and commands are discovered only from `.opencode/agents` and `.opencode/commands` (plus legacy singular dirs), so the `.opencode` directory pointers from #253 are required for V2 as well as V1.
- V2 reads V1 config by translating it in memory, but V1 cannot read native V2 keys. A stale V1-shaped `opencode.jsonc` can therefore appear to work while still pointing at a V1 plugin entry; the installer must regenerate it.
- The live V2 schema is `https://opencode.ai/config.json` (66 KB at verification). Its only external `$ref` is `https://models.dev/model-schema.json#/$defs/Model` on `small_model` (382 KB). The Plan A fixture replaces that one ref with `{"type": "string"}` and documents the transform.

### Repository facts after #253 (verified 2026-11-02)

- `cli/src/lib/layout.ts` declares `ARTIFACT_ROOT = '.agents'`, `LEGACY_ARTIFACT_ROOT = '.opencode'`, `CONTENT_CATEGORIES`, `RUNTIME_POINTER_DIRS`, `CONFIG_FILES`, `RUNTIMES`, `PLUGIN_ENTRY`, `SKILLS_CONFIG_PATH`, `sourceDirFor`, `destRelFor`, `pointerPathsFor`, and `configFileFor`. Plan A replaces the private config table with `RUNTIME_SHAPES` and adds `schemaUrlFor`/`pluginEntriesFor`.
- `cli/src/commands/install.ts` gates on Node, resolves the source, validates providers/models, builds `GenerateOptions`, calls `initManagedManifest`, and later `syncGeneratedOpenCodeJsonc`, `syncAgentsTreeWithPermissions`, category synchronization, and `ensureRuntimePointers`. Plan A inserts the OpenCode version preflight before `initManagedManifest`.
- `cli/src/lib/config-gen.ts` still emits singular `"agent"`, `"provider"`, `"plugin"`, `"permission"` and now emits `"skills": ["./.agents/skills"]`. Plan A leaves emission unchanged and adds `isRuntimeConfigStale` without wiring it.
- `cli/src/lib/permissions.ts` renders only the V1 `permission:` map. `install.ts` calls it for both runtimes. Plan B changes this.
- `base/agents/code.md` still declares `temperature: 0.1` (also true in open PR #255). Plan B removes it.
- `base/plugins/ponytail/package.json`, `session-tracker/package.json`, and `token-counter/package.json` declare only `main` and the V1 peer `@opencode-ai/plugin`. Open PR #274 would add a fourth plugin, `wayforge-update`, with V1 entrypoints only.
- `cli/package.json` has no `ajv` today; Plan A adds it as a dev dependency with the schema fixture and harness.
- #253 replaces the integration script with `cli/tests/helpers/install.ts` + `cli/tests/integration/install-layout.test.ts`; `Makefile` no longer has `check-integration`.
- ADR numbers: ADR-0046 is added by #253, ADR-0047 exists, and ADR-0048 is claimed by both open PR #255 and open PR #274. Use **ADR-0049** for Plan B.
- `VERSION` is `1.0.2`; no PR bumps it, although milestone 1.1.0 is open. GitHub records #226 `blockedBy` #247, #248, and #227 (all closed) and omits #231.

### Plan A additions Plan B depends on

- `RuntimeShape` / `RUNTIME_SHAPES` with `configFile`, `schemaUrl`, `keys`, `pluginEntries`, and `minimumOpenCodeMajor`.
- `schemaUrlFor(runtime)` and `pluginEntriesFor(runtime)`.
- `assertRuntimeSupported(runtime, opts?)` and the wired preflight in `doInstall`.
- `cli/tests/fixtures/opencode-v2-config.schema.json`, `cli/tests/fixtures/README.md`, and `cli/tests/helpers/schema.ts`.
- `isRuntimeConfigStale(runtime, file)` implemented and unit-tested but intentionally unwired.

## Incoming work and impact

PR state verified 2026-11-02. #253 and #254 have since merged; their rows record the planning-time impact. #255 remains open with a stale base, and #274 is new.

| PR | Issue | What it changes | Impact on #226 | Blocking? |
|---|---|---|---|---|
| **#253** | #227 | `.opencode/**` -> `.agents/**`; flattens `base/opencode/**` -> `base/**`; adds `layout.ts`, `pointers.ts`, migration, `.kilo` pointers; adds `skills` config; deletes `run.sh`/`check-integration`; adds vitest install helper | Invalidates every path and test assumption in the previous plan; supplies the layout declaration this plan extends; resolves Kilo routing | **Merged** (`8589948`); prerequisite satisfied |
| **#255** | #231 | Adds `reviewer` agent and config entries; changes `code.md`, `delivery`, `planner`, `research`, `troubleshooter`; adds `/deliver`, `/deliver-plan`, `delivery-policy`; adds `reviewer` and more denies to `agents.yml`; rewrites `plan` skill contract; claims ADR-0048 | Changes the agent set and permission fixtures; requires this plan to use a free ADR number | **Deferred** (2026-11-02). #226 lands first; #255 rebases and adapts afterward |
| **#254** | #248 | Deletes `install/legacy/**`; rewrites `run.sh` to a TS-only smoke test; removes legacy-only tests; `VERSION` newline-only | Confirms `run.sh` is not a stable surface; no code overlap with #226 | **Merged** (`ce40dbf`); prerequisite satisfied |
| **#274** | #239 | Adds `wayforge-update` plugin (OpenCode `server` export + Kilo descriptor); claims ADR-0048; installer installs it but does not register it | No runtime shape change. If merged before #226, the shipped plugin set becomes four and Plan B needs a V2 entrypoint for it | No (conditional scope) |
| **#256** | #243 | Checksum verification in `install.sh` / `install.ps1` | None; release-installer security only | No |
| **#257** | #234 | Plan closeout and `prclose` docs | None | No |
| **#246** | #229 | Draft plan for installer convergence (`collectArtifactPlan`, content registry, drift policy) | No code yet. #226 should keep discovery/descriptor logic in `layout.ts` so the later convergence work does not have to undo it | No |
| **#203** | #202 | `/help` command plus `metadata.workflow` on commands/skills; branch is currently `dirty` | Adds content files only; no runtime shape change | No |

**Issue-dependency decision (2026-10-27; superseded 2026-11-02):** #227 and #248 are closed. The maintainer has deferred #255, so #231 is not a blocker and the `status:blocked` label should be removed. GitHub currently records #226 `blockedBy` #247, #248, and #227 - all closed - and omits #231, so no relationship change is needed. The planner cannot mutate work items; a maintainer must remove the label.

## Resolved decisions

1. **V2-only for `--runtime opencode`.** Native V2 artifacts. If the installed `opencode` major is `< 2`, install fails before mutation with an actionable message. V1 config translation is not a compatibility path.
2. **Kilo Code stays V1-shaped.** `--runtime kilocode` keeps `agent`/`provider`/`plugin`/`permission`, the Kilo schema URL, and the `.kilo` pointers supplied by #253. No OpenCode version gate for kilocode.
3. **Version detection.** Read `WAYFORGE_OPENCODE_VERSION` when set; otherwise run `opencode --version`. Missing or unparsable output logs a warning and assumes V2. Parsed major `< 2` fails. The env override is the offline/CI escape hatch. A leading `v` is accepted. Plan A implements and wires this gate; Plan B does not reopen it.
4. **JSONC stays the output format.** The managed header remains. Schema validation is a test-time concern using the Plan A vendored V2 schema snapshot, not a runtime fetch.
5. **One plugin package, two entrypoints.** Keep the V1 entrypoints and add V2 entrypoints that import `@opencode/plugin` and reuse the existing pure helpers. `package.json` keeps `main` for V1 and adds `exports["."]` for V2.
6. **All shipped plugins are explicit in both runtime configs.** The #253 layout no longer places plugins under a runtime-discovered `.opencode/plugins/` directory. The config must list `ponytail`, `session-tracker`, and `token-counter` explicitly for both `opencode` and `kilocode`. If #274 lands first, `wayforge-update` becomes a fourth entry. This also restores Kilo loading for the plugins that previously relied on auto-discovery.
7. **Permissions are translated, not duplicated.** Extend the existing YAML reader to emit an ordered V2 rule list for `opencode`, preserving YAML order and mapping `bash -> shell`, `task -> subagent`. Kilo keeps the V1 map.
8. **Legacy `temperature` is removed.** `base/agents/code.md` drops `temperature: 0.1`; V2 has no supported equivalent. Kilo loses that setting.
9. **Commands and skills need no shape change.** Command frontmatter uses `description`/`agent`, which V2 keeps. No `subtask` usage exists. Skills are discovered from `.agents/skills`; V2 accepts the existing `name`/`description`/`compatibility`/`metadata` fields.
10. **No new runtime id.** The product surface remains `--runtime opencode|kilocode`; V2 is the meaning of `opencode` from this release onward.
11. **Stale config regeneration is part of the change.** A managed `opencode.jsonc` written by the previous wayforge release (V1 shape, `.agents` paths) must be regenerated on upgrade even without `--force`, because it names a V1 plugin file and singular keys. Plan A adds `isRuntimeConfigStale(runtime, file)`; Plan B wires it after V2 emission lands.

## Out of scope

- Migrating consuming repositories' already-committed configs in place.
- Supporting OpenCode 1.x under `--runtime opencode`.
- Pi runtime (#204/#205) and any new agents, skills, commands, or workflow features unrelated to #226.
- Removing or replacing the deprecated `enabled_providers` / `small_model` keys.
- Reopening the `.kilo/**` routing work owned by #227.
- Changing the legacy release installers (`install/install.sh`, `install/install.ps1`).
- Resurrecting `cli/tests/integration/run.sh`.
- Reopening Plan A's version gate decisions, schema harness design, or descriptor shape.

## Deferred task outline

> Expand each task into the five-step contract (expected behaviour, validation, minimal implementation, run test, commit) only after Plan A lands and the re-plan checklist below is complete. Do not start implementation from this outline.

### Task 1: Generate native OpenCode V2 config and snapshot Kilo V1 output

**Objective:** Make config generation emit V2-native keys, directory plugin entries, and V2 permission section for `opencode`, while producing the expected V1 output for `kilocode`.

**Files:**
- Modify: `cli/src/lib/config-gen.ts` (`generateOpenCodeJsonc`, `buildAgentBlockJson`, plugin section, schema URL, `isRuntimeConfigStale` wiring readiness)
- Modify: `cli/tests/unit/config-gen.test.ts`
- Validate: `npx vitest run cli/tests/unit/config-gen.test.ts`

**Depends on:** Plan A Tasks 1, 4, and 5.

**Acceptance outline:**

- `opencode` output contains only native V2 keys: `"agents"`, `"providers"`, `"plugins"`, `"permissions"`, plus `"skills": ["./.agents/skills"]`. No `"agent"`, `"provider"`, `"plugin"`, or top-level `"permission"`.
- `"plugins"` is the directory list from `pluginEntriesFor('opencode')`.
- `"permissions"` is `[{ "action": "skill", "resource": "*", "effect": "allow" }]`.
- `enabled_providers`, `model`, `small_model`, `default_agent`, and `share` stay unchanged.
- `kilocode` keeps singular keys, the Kilo schema, `"skills"`, and a file-based plugin list for every shipped plugin.
- Plugin inventory is derived from the installed set, not hardcoded to three. Today it is `ponytail`, `session-tracker`, `token-counter`; if #274 has merged, add `wayforge-update`.
- Every `opencode` sample (free-tier, openai, github-copilot, openai+github-copilot, opencode-go, laberit, openai+github-copilot+laberit+opencode-go, model overrides) validates against the Plan A schema fixture.
- A snapshot-style equality check pins the Kilo V1 shape so it does not drift.
- Keep the existing `{env:}`/`{file:}` absence assertion for both runtimes.

### Task 2: Render V2 agent permissions and remove legacy `temperature`

**Objective:** Emit V2 ordered permission rules into OpenCode agent frontmatter and keep the V1 map for Kilo Code.

**Files:**
- Modify: `cli/src/lib/permissions.ts` (`renderAgentPermissionBlock`, `renderAgentWithCentralPermissions`, `syncAgentsTreeWithPermissions`)
- Modify: `cli/src/commands/install.ts` (permission call sites)
- Modify: `base/agents/code.md` (remove `temperature: 0.1`)
- Modify: `cli/tests/unit/permissions.test.ts`
- Validate: `npx vitest run cli/tests/unit/permissions.test.ts`

**Depends on:** Plan A Task 1; Plan B Task 1 for install wiring context.

**Acceptance outline:**

- For `opencode`, each agent frontmatter gets an ordered YAML list:
  ```yaml
  permissions:
    - action: read
      resource: "*"
      effect: allow
    - action: edit
      resource: "*"
      effect: ask
    - action: question
      resource: "*"
      effect: allow
    - action: shell
      resource: "*"
      effect: allow
    - action: shell
      resource: "sudo*"
      effect: deny
    - action: external_directory
      resource: "*"
      effect: deny
    - action: external_directory
      resource: "/tmp/**"
      effect: allow
    - action: subagent
      resource: "*"
      effect: deny
    - action: subagent
      resource: research
      effect: allow
  ```
- Rules preserve `agents.yml` order (catch-all before deny-list; `external_directory` `*` deny before `/tmp/**` allow).
- Mapping: `read`/`edit`/`question` unchanged; `bash -> shell`; `external_directory` unchanged; `task -> subagent`.
- Scalar permissions (`edit: ask`, `task: deny`) become one rule with `resource: "*"`.
- `kilocode` keeps the existing `permission:` map.
- The renderer covers every agent in `agents.yml`, including `reviewer` when #255 lands, without hardcoded agent names.
- Frontmatter replacement strips both an old `permission:` map and an old `permissions:` list before inserting the new block.
- `code.md` contains no `temperature:` field.

### Task 3: Add the ponytail V2 entrypoint and package exports

**Objective:** Make ponytail load under the OpenCode V2 plugin API without breaking its V1 entrypoint for Kilo Code.

**Files:**
- Create: `base/plugins/ponytail/ponytail.v2.mjs`
- Modify: `base/plugins/ponytail/package.json`
- Create or extend: plugin entry tests (see Task 5 for the consolidated test shape)
- Validate: `npx vitest run cli/tests/unit/plugin-entries.test.ts`

**Depends on:** Plan A Task 1 (descriptor plugin entries); Plan B Task 1 (V2 config lists the directory).

**Acceptance outline:**

- V2 entrypoint default-exports `Plugin.define({ id: 'wayforge.ponytail', setup(ctx) })`.
- V1 `experimental.chat.system.transform` maps to `ctx.session.hook("context", e => e.system.push({ type: "text", text }))`.
- V1 `command.execute.before` for `/ponytail <mode>` maps to `ctx.session.hook("prompt", ...)` inspecting prompt text, or a command transform if the command is registered by the plugin.
- Reuses `ponytail-config.js` and `ponytail-instructions.js`.
- `package.json` keeps `main` for V1 and adds `exports: { ".": "./ponytail.v2.mjs" }`.
- Declares both `@opencode-ai/plugin` and `@opencode/plugin` as peers; wayforge copies local plugins and does not install package dependencies.
- V1 entrypoint must not import `@opencode/plugin`.

### Task 4: Add the token-counter V2 entrypoint and package exports

**Objective:** Make token-counter load under the OpenCode V2 plugin API without breaking its V1 entrypoint.

**Files:**
- Create: `base/plugins/token-counter/index.v2.js`
- Modify: `base/plugins/token-counter/package.json`
- Extend: plugin entry tests
- Validate: `npx vitest run cli/tests/unit/plugin-entries.test.ts`

**Depends on:** Plan A Task 1; Plan B Task 1.

**Acceptance outline:**

- V2 entrypoint default-exports `Plugin.define({ id: 'wayforge.token-counter', setup(ctx) })`.
- V1 `tool` map + zod args maps to `ctx.tool.transform` with a JSON Schema object (`type`, `properties`, `required`, `additionalProperties: false`).
- Execute uses the captured `ctx.location.directory` from `setup` instead of V1 `ctx.directory`.
- Reuses `gpt-tokenizer` and the existing rendering helpers.
- `package.json` keeps `main`, adds `exports: { ".": "./index.v2.js" }`, and declares both plugin APIs as peers.
- V1 entrypoint must not import `@opencode/plugin`.

### Task 5: Add the session-tracker V2 entrypoint, package exports, and plugin-entry validation

**Objective:** Make session-tracker load under the OpenCode V2 plugin API without breaking its V1 entrypoint, and prove the whole shipped plugin inventory is wired for both runtimes.

**Files:**
- Create: `base/plugins/session-tracker/index.v2.js`
- Modify: `base/plugins/session-tracker/package.json`
- Create: `cli/tests/unit/plugin-entries.test.ts` (consolidates Tasks 3-5 assertions)
- Validate: `npx vitest run cli/tests/unit/plugin-entries.test.ts`

**Depends on:** Plan A Task 1; Plan B Tasks 1, 3, and 4.

**Acceptance outline:**

- V2 entrypoint default-exports `Plugin.define({ id: 'wayforge.session-tracker', setup(ctx) })`.
- V1 `tool` map + `tool.schema` maps to `ctx.tool.transform(editor => editor.add({ input: <JSON Schema>, execute }))`.
- V1 `chat.params` maps to `ctx.session.hook("context", ...)` to capture the active agent.
- V1 `tool.execute.after` maps to `ctx.tool.hook("execute.after", ...)`.
- V1 `command.execute.before` maps to `ctx.session.hook("prompt", ...)`.
- V1 `event` maps to `ctx.event.subscribe({ signal })` with cleanup.
- Keep the in-memory `Map` state; V2 plugin lifetime matches the process and `setup` runs once. Return cleanup only where the plugin owns resources.
- `package.json` keeps `main`, adds `exports: { ".": "./index.v2.js" }`, and declares both plugin APIs as peers.
- `plugin-entries.test.ts` reads the generated V2 and V1 configs and asserts every plugin path exists under `base/plugins/**`; V2 entries are directories and V1 entries are files; each V2 entrypoint contains `Plugin.define` and a stable ID; each `package.json` keeps `main`, adds `exports`, and declares both peers; no V1 entrypoint imports `@opencode/plugin`.
- If #274 has merged, add a `wayforge-update` V2 entrypoint (`Plugin.define` with a stable `wayforge.update` id) and assert both configs list four entries.

### Task 6: Thread the descriptor through install/update and add vitest integration coverage

**Objective:** Make fresh installs, migrations, and refreshes use the descriptor end to end, and prove the V2 output with the post-#253 vitest harness.

**Files:**
- Modify: `cli/src/commands/install.ts` (`GenerateOptions`, config sync, agent/plugin sync, `injectPermissions`, refresh path, `isRuntimeConfigStale` call sites)
- Modify: `cli/src/commands/interactive.ts` if it constructs `GenerateOptions`
- Modify: `cli/tests/helpers/install.ts` (V2 env override and descriptor-aware helpers)
- Create: `cli/tests/integration/install-v2.test.ts`
- Modify: `cli/tests/integration/install-layout.test.ts` if existing V1 expectations change
- Validate: `npx vitest run cli/tests/integration/install-v2.test.ts` and `make check`

**Depends on:** Plan B Tasks 1-5.

**Acceptance outline:**

- A fresh `--runtime opencode` install with `WAYFORGE_OPENCODE_VERSION=2.2.5` writes a V2-valid `opencode.jsonc` with `.agents` paths, V2 agent frontmatter in `.agents/agents/*.md`, `.opencode/agents` and `.opencode/commands` pointers, and every shipped plugin entry as a directory.
- A second identical install produces no changes (idempotent) and keeps the manifest stable.
- A refresh over a post-#227 V1-shaped `opencode.jsonc` regenerates it to V2 shape without `--force` because `isRuntimeConfigStale('opencode', file)` returns true.
- A refresh over a pre-#227 `.opencode` install still migrates to `.agents` and then writes V2 shape.
- `--runtime opencode` with a detected or configured 1.x exits before writing `.wayforge-managed`, `.agents/**`, or pointers.
- `--runtime kilocode` keeps the V1 config shape, writes `.kilo/agents` and `.kilo/commands` pointers (from #253), and lists every shipped V1 plugin entry.
- `WAYFORGE_OPENCODE_VERSION` is the only mechanism used by tests; do not depend on the host binary being V2.
- Replace the `isLayoutStaleConfig` call sites with `isRuntimeConfigStale(runtime, configPath)` only after Task 1 emits V2. Keep the existing `--force` semantics and the #253 migration/pointer tests green.

### Task 7: Record ADR-0049, architecture, compatibility matrix, README, changelog, and log

**Objective:** Record the supported runtime/version matrix, the `.agents` layout interaction, and the migration decision so consumers and future maintainers do not rediscover it.

**Files:**
- Create: `docs/ai/decisions/ADR-0049-opencode-v2-runtime-shape.md` (ADR-0048 is claimed by open PRs #255 and #274)
- Modify: `docs/ai/architecture.md` (runtime boundary, `.agents` layout, generated config description)
- Modify: `docs/compatibility-matrix.md` (OpenCode column is V2 2.2.5; Kilo 7.8.x is V1; Pi unchanged)
- Modify: `README.md` (runtime requirement, version gate, provider key names, plugin entry description)
- Modify: `CHANGELOG.md` (add a bullet under the merged `[Unreleased]` section)
- Modify: `docs/ai/logs/2026-10.md` (or the current month's log)
- Validate: `make check`

**Depends on:** Plan B Tasks 1-6.

**Acceptance outline:**

The ADR must state:

- `--runtime opencode` targets OpenCode 2.x and validates against the V2 schema.
- `--runtime kilocode` remains on the V1 shape until Kilo Code ships its own V2 runtime/plugin API.
- OpenCode 1.x is unsupported for `opencode` and fails before mutation; `WAYFORGE_OPENCODE_VERSION` is the offline/CI escape hatch.
- The installed artifact root is `.agents/`; OpenCode reaches agents/commands through `.opencode` pointers, skills through `.agents/skills`, and plugins through explicit directory entries.
- Plugin entrypoints are shape-specific (`ponytail.mjs` vs `ponytail.v2.mjs`, etc.).
- Every shipped plugin is an explicit config entry (three today; four if #274 has merged); the old `.opencode/plugins/` auto-discovery assumption no longer holds.
- `temperature` was removed from `code.md` because V2 ignores/rejects it.
- Stale V1-shaped `opencode.jsonc` files are regenerated on upgrade.
- Schema snapshot refresh procedure: fetch `https://opencode.ai/config.json`, replace the external `small_model` ref with `{"type":"string"}`, update the fixture date, rerun config-gen tests, record the date.
- `enabled_providers` / `small_model` are deprecated in the V2 schema but retained; removing them is a separate decision.
- Wayforge's own `VERSION` (`1.0.2` at planning time) is unrelated to the OpenCode runtime major; do not conflate them.

Documentation must also record the Plan A/Plan B split, the version gate, and the human validation results from Task 6.

## Design notes carried forward

### Config shape

For `opencode`, the generated file contains only native V2 keys:

- `"agents"`, `"providers"`, `"plugins"`, `"permissions"`.
- `"plugins": ["./.agents/plugins/ponytail", "./.agents/plugins/session-tracker", "./.agents/plugins/token-counter"]`.
- `"permissions": [{ "action": "skill", "resource": "*", "effect": "allow" }]`.
- `"skills": ["./.agents/skills"]`.
- No `"agent"`, `"provider"`, `"plugin"`, or top-level `"permission"`.
- `enabled_providers`, `model`, `small_model`, `default_agent`, and `share` stay unchanged.

For `kilocode`, output keeps singular keys, the Kilo schema, `"skills": ["./.agents/skills"]`, and a file-based plugin list:

```jsonc
"plugin": [
  "./.agents/plugins/ponytail/ponytail.mjs",
  "./.agents/plugins/session-tracker/index.js",
  "./.agents/plugins/token-counter/index.js"
]
```

Plugin inventory is derived from the installed set, not hardcoded to three. Today that set is `ponytail`, `session-tracker`, and `token-counter`. If PR #274 has merged, include `wayforge-update` in both runtime lists and add its V2 entrypoint.

### Upgrade rule

- `isRuntimeConfigStale('opencode', file)` returns true for a managed config that contains `.opencode/`, lacks `"skills"`, lacks any of `"agents"`/`"providers"`/`"plugins"`/`"permissions"`, or contains `"agent"`/`"provider"`/`"plugin"`/`"permission"`.
- `isRuntimeConfigStale('kilocode', file)` keeps the #253 layout checks only.
- A stale managed config is regenerated even without `--force`; an unmanaged existing file is still preserved according to the existing skip policy.

### Plugin V1 -> V2 mapping

| Plugin | V1 | V2 |
|---|---|---|
| ponytail | `experimental.chat.system.transform` | `ctx.session.hook("context", e => e.system.push({ type: "text", text }))` |
| ponytail | `command.execute.before` for `/ponytail <mode>` | `ctx.session.hook("prompt", ...)` inspecting prompt text, or a command transform if the command is registered by the plugin |
| session-tracker | `tool` map + `tool.schema` | `ctx.tool.transform(editor => editor.add({ input: <JSON Schema>, execute }))` |
| session-tracker | `chat.params` | `ctx.session.hook("context", ...)` to capture the active agent |
| session-tracker | `tool.execute.after` | `ctx.tool.hook("execute.after", ...)` |
| session-tracker | `command.execute.before` | `ctx.session.hook("prompt", ...)` |
| session-tracker | `event` | `ctx.event.subscribe({ signal })` with cleanup |
| token-counter | `tool` map + zod args | `ctx.tool.transform` with a JSON Schema object |
| token-counter | execute `ctx.directory` | captured `ctx.location.directory` in `setup` |
| all | module `server()` export | default export `Plugin.define({ id, setup })` |

Each V2 entrypoint has a stable ID (`wayforge.ponytail`, `wayforge.session-tracker`, `wayforge.token-counter`) and reuses the existing helpers (`ponytail-config.js`, `ponytail-instructions.js`, `lib/render-table.js`, `gpt-tokenizer`). V1 entries must not import `@opencode/plugin`.

If PR #274 has merged, `wayforge-update` is a fourth shipped plugin. Add a V2 entrypoint (`Plugin.define` with a stable `wayforge.update` id) while keeping its OpenCode `server` and Kilo descriptor as the V1 paths, then add it to both config lists.

### Integration expectations

- Use `doInstall(installOptions(...))` or the CLI in a temp repo, with `vi.stubEnv('WAYFORGE_OPENCODE_VERSION', '2.2.5')`.
- Assert the V2 key matrix, schema validation, agent frontmatter, plugin paths, and pointer existence.
- Assert idempotency by hashing the generated config and agent files across two installs.
- Add the negative gate test: `WAYFORGE_OPENCODE_VERSION=1.19.5` makes the install exit non-zero and leaves the temp repo without `.wayforge-managed`.
- Add the stale-V1-config upgrade test.
- Keep the #253 migration and pointer tests green.

Validation owner: `agent` for vitest and `make check`; `human` for the real OpenCode 2.2.5 and Kilo 7.8.x load checks.

### Human runtime validation (required before closure)

Unit and vitest checks cannot prove runtime discovery through symlink/junction pointers or plugin loading. Required:

- OpenCode `@opencode/cli@2.2.5` on one host: install into a temp repo, run `opencode`, confirm every shipped plugin ID appears in the plugin/status list, invoke `/ponytail full`, call `token_summary`, call `count_tokens` with a path, and verify counters increase after a tool call.
- Kilo `7.8.x` on one host: confirm the V1 shape still loads agents, commands, skills, and the shipped V1 plugins.
- Record the host, runtime version, and output in the ADR/log.

## Risks and assumptions to verify during Plan B re-planning

- **Pointer traversal under V2 is unverified.** #253 verified `.opencode` pointers with OpenCode 1.18.35 only. V2 must discover agents and commands through a symlink or junction. If V2 does not traverse them, the fallback is a generated stub or another runtime-specific pointer, and #227's "no duplication" rule must be revisited. This is a blocking human verification before Task 6 closes.
- **V2 hook payloads for session-tracker.** The migration table gives destinations, not exact payloads. `ctx.session.hook("context", ...)` may not expose the active agent the way V1 `chat.params` did. Fall back to deriving the agent from session events and document the limitation. Human smoke validation is mandatory.
- **Ponytail command interception.** V2 `command.execute.before` has no global one-to-one hook. The prompt hook may observe the raw `/ponytail full` prompt before command expansion, or it may not. Verify with the real runtime; if it fails, register a command transform or document the limitation.
- **Local plugin dependency resolution.** It is unverified whether OpenCode 2 resolves a local plugin's `package.json` peers/dependencies. If it does not, the V2 entrypoints must be dependency-free or document the required global install.
- **Plugin `exports` may affect V1 discovery.** V1 config entries name files directly, so `exports` should be inert, but verify both OpenCode 1.x and Kilo 7.8.x after adding it.
- **Schema snapshot drift.** The vendored schema is a point-in-time copy with one documented external-ref substitution. CI validates against the fixture, so a stale fixture can pass while upstream changes. The ADR refresh procedure mitigates this.
- **This workstation runs OpenCode 1.19.5.** Unit/integration tests use `WAYFORGE_OPENCODE_VERSION=2.2.5`; the gate intentionally fails real local installs until `@opencode/cli` 2.2.5 is installed or the env override is set.
- **Kilo Code target is V1.** Kilo 7.8.x accepts the V1 shape and the `.kilo` pointers verified by #253. Do not infer V2 support from the hybrid `app.kilo.ai` schema. When Kilo's V2 port ships, switching the descriptor is a focused follow-up.
- **Merge-train conflicts.** #253 and #254 are already merged. #255 will land after #226 and must rebase onto it; #226 stays free of `.opencode` paths and uses the current five-step plan format.
- **Plan-format drift from #255.** #255 arrives after #226, so this plan does not convert to the outcome-based contract. When #255 rebases, its plan-format changes apply to future plans; do not retroactively rewrite completed #226 tasks.
- **Plan A coupling.** Plan B cannot start until Plan A's descriptor, schema harness, and stale function are merged. If Plan A's signatures change during implementation, update the handoff contract before expanding Plan B tasks.

## Re-plan checklist when Plan A lands

1. Confirm Plan A is merged and `make check` is green.
2. Re-read `cli/src/lib/layout.ts`, `cli/src/lib/runtime-version.ts`, `cli/src/lib/config-gen.ts`, and `cli/tests/helpers/schema.ts` to verify the handoff contract.
3. Re-check the current `@opencode/cli`, `@opencode/plugin`, and `opencode-ai` versions; refresh the schema fixture if upstream drifted.
4. Check whether PR #274 merged. If yes, add `wayforge-update` to both plugin-entry lists and its V2 entrypoint to Tasks 1, 3-5.
5. Check whether PR #255 merged or rebased. If yes, reconcile the agent set (`reviewer`), permission fixtures, and plan format.
6. Re-check GitHub issue dependencies and remove the `status:blocked` label if it is still present.
7. Re-verify the ADR number: ADR-0048 is claimed by #255/#274; use ADR-0049 unless both released their claim.
8. Confirm the seven-task budget with the user (6-8 tasks require confirmation under the `plan` skill).
9. Expand each outline task into the five-step contract with exact commands and commit messages.
10. Re-verify the human validation hosts and runtime versions before Task 6 closure.
