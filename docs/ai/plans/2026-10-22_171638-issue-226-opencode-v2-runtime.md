---
status: planned
created: 2026-10-22
task: 0/6
required_gates:
  architect_review: true
  memory_update: true
---

# OpenCode V2 runtime migration implementation plan (Issue #226)

**Goal:** Make `--runtime opencode` emit deterministic, native OpenCode 2 artifacts that validate against the V2 schema, while `--runtime kilocode` keeps producing the V1-shaped artifacts Kilo Code currently accepts.

**Architecture:** Introduce a single runtime descriptor that owns the config filename, schema URL, top-level config key names, plugin entry style, and supported major version. Config generation, permission rendering, and plugin resolution consume that descriptor instead of hardcoded `runtime === 'opencode'` conditionals. A version gate runs before any install mutation and rejects OpenCode 1.x with an actionable message.

**Tech Stack:** TypeScript, Node.js >= 18, Commander, fs-extra, vitest, `ajv` + `jsonc-parser` (new dev dependencies), `make check`.

**Scope classification:** `multi-task`

**Task budget rationale:** six vertical slices because the runtime contract, generated config, agent frontmatter, plugin API, install wiring, and durable documentation are independently reviewable deliverables. Merging them would force unstable intermediate states (for example, a V2 config referencing plugin entrypoints that do not exist yet). No task is split further because all six share the same runtime descriptor API.

## Verified context (2026-10-22)

Upstream:

- OpenCode V2 exists and ships as `@opencode/cli@2.1.3`; V1 still ships as `opencode-ai@1.19.4`. Plugin APIs are `@opencode/plugin@2.1.3` (V2) and `@opencode-ai/plugin@1.19.4` (V1). Kilo Code plugin package is `@kilocode/plugin@7.8.15`.
- Kilo CLI 1.0 (`@kilocode/cli@7.8.15`) is a fork of the **OpenCode 1.x line**. Its docs specify V1 artifacts: `kilo.jsonc`, `permission` maps, `plugin` arrays, `@kilocode/plugin`, and a plugin module shaped `export default { id, server }` with `tool()` + zod. V2 `Plugin.define({ id, setup })` does not run there.
- Kilo CLI 1.0 does **not** read project `.opencode/` directories. Project agents live in `.kilo/agents/`, skills in `.kilo/skills/`, plugins in `.kilo/plugin/`, and tools in `.kilo/tool/`; config is `kilo.json[c]` or `.kilo/` (`https://kilo.ai/docs/code-with-ai/platforms/cli`, `https://kilo.ai/docs/automate/extending/plugins`, `https://kilo.ai/docs/customize/marketplace`, `https://kilo.ai/docs/customize/custom-subagents`). Root `opencode.json[c]` remains a legacy config-file fallback, but `.opencode/` directories are not scanned.
- History: `.opencode` directory support was removed by PR #11638 (commit `ef9b1dc`, merged 2026-06-29, first released in v7.3.63 on 2026-06-30). Kilo 7.3.8, still installed on this workstation, does read `.opencode/agents` (verified with `kilo agent list`). Current main scans only `.kilocode` and `.kilo` (`packages/opencode/src/config/paths.ts`).
- Separate, still-open bug: legacy `opencode.json`/`opencode.jsonc` **override** `kilo.jsonc` at global, project-root, and `.kilo/` scopes. Merge is last-wins because `packages/opencode/src/config/config.ts` loads names in the order `["kilo", "opencode"]` (and the config-dir loop uses `ALL_CONFIG_FILES` in the same order). Kilo issue #14294 is open and was confirmed on main on 2026-09-25; #12278 was closed by the inactivity bot without a fix. A leftover `opencode.jsonc` therefore makes `kilo.jsonc` appear ignored. Removing `.opencode/` directories did **not** remove these files (bot confirmation in #12278).
- `https://app.kilo.ai/config.json` is a hybrid schema that exposes both singular (V1) and plural (V2) keys, so editor/schema acceptance is **not** evidence of runtime support. Kilo's documented runtime and plugin API remain V1. Kilo tracks its V2 port separately (issues tagged `v2-port`, P0 V2).
- V2 docs: <https://opencode.ai/v2/docs/>. Relevant pages: `config`, `agents`, `commands`, `skills`, `permissions`, `build/plugins/migrate-v1`.
- V2 native config renames: `agent` → `agents`, `provider` → `providers`, `plugin` → `plugins`, `permission` → `permissions` (ordered rule list). `skills` becomes a discovery-source array; `.opencode/skills/**` auto-discovery is unchanged.
- V2 permission rules are `{ action, resource, effect }`, last match wins. `bash` becomes `shell`; `task` becomes `subagent`.
- V2 agents reject legacy frontmatter fields including `temperature`, `top_p`, `permission`, `tools`, `disable`, `maxSteps`. `mode: primary|subagent|all` remains valid.
- V2 plugin implementations do not run in V1 shape: a V2 plugin default-exports `Plugin.define({ id, setup(ctx) })`; V1 exports `server()`. Local plugins are discovered from `.opencode/plugins/`, and the config entry for a local path is an object `{ "package": "..." }`.
- V2 reads V1 config by translating it in memory, but V1 cannot read native V2 keys. This is why the runtime shape must be explicit.

Repository facts:

- Runtime is a hardcoded two-value union: `Runtime = 'opencode' | 'kilocode'` (`cli/src/types.ts:4`).
- Schema URL and config filename are chosen in `cli/src/lib/config-gen.ts:178-181` and `:226`.
- Generated config hardcodes singular keys and a V1 plugin entry: `"agent"`, `"provider"`, `"plugin": ["./.opencode/plugins/ponytail/ponytail.mjs"]`, `"permission": {...}` (`cli/src/lib/config-gen.ts:199-216`).
- Agent fragments all start with `"agent": {` (`base/opencode/config/agents/*.jsonc:1`).
- Permissions are rendered from `base/opencode/permissions/agents.yml` into `permission:` YAML maps by `cli/src/lib/permissions.ts:49` and `:170-174`.
- `base/opencode/agents/code.md:4` declares `temperature: 0.1`, a legacy V2 field.
- Shipped plugins: `ponytail` (64 lines), `session-tracker` (244), `token-counter` (118). All use the V1 `server()` entrypoint; two use `@opencode-ai/plugin/tool` and zod-style `tool.schema` arguments.
- `cli/tests/unit/config-gen.test.ts` and `cli/tests/unit/permissions.test.ts` assert the current V1 shape and must be split into V1 (kilocode) and V2 (opencode) expectations.
- `cli/tests/integration/run.sh` compares TS output against the deprecated legacy bash installer. The legacy installer cannot emit V2 shape, so the opencode comparison must be replaced with V2 assertions.
- No JSON-schema validator is currently a dependency (`cli/package.json`).
- On this workstation `opencode --version` reports `1.19.2`, so the new gate will (correctly) block local installs until OpenCode 2 is installed or `WAYFORGE_OPENCODE_VERSION` is set.

## Resolved decisions

1. **V2-only for `--runtime opencode`.** The runtime emits native V2 artifacts. If the installed `opencode` major is `< 2`, install fails before any mutation with an actionable message. V1 config translation is not used as a compatibility path.
2. **Kilo Code stays V1-shaped.** `--runtime kilocode` keeps `agent`/`provider`/`plugin`/`permission`, the Kilo schema URL, and the V1 plugin entry. No version gate for kilocode. This is necessary but not sufficient: Kilo CLI 1.0 reads `.kilo/**`, while the current installer writes `.opencode/**` for both runtimes. Kilo load verification is blocked on a path-routing fix; see the risk section and the open scope decision.
3. **Version detection.** Read `WAYFORGE_OPENCODE_VERSION` when set; otherwise run `opencode --version`. Missing or unparsable output logs a warning and assumes V2. Parsed major `< 2` fails. The env override is documented as the offline/CI escape hatch.
4. **JSONC stays the output format.** The managed header remains. Schema validation is a test-time concern using a vendored V2 schema snapshot, not a runtime fetch.
5. **One plugin implementation core, two thin entrypoints per plugin.** Keep `ponytail.mjs`, `session-tracker/index.js`, and `token-counter/index.js` as V1 entrypoints; add `*.v2.*` entrypoints that import `@opencode/plugin` and reuse the existing pure helpers. The descriptor selects the entrypoint written into config.
6. **Permissions are translated, not duplicated.** Extend the existing YAML reader to emit an ordered V2 rule list for `opencode`, preserving YAML order and mapping `bash → shell`, `task → subagent`.
7. **Legacy `temperature` is removed.** `code.md` drops `temperature: 0.1`; V2 has no supported equivalent. Kilo Code loses that setting, which is acceptable and must be noted in the ADR.
8. **Commands and skills need no shape change.** Command frontmatter uses `description`/`agent`, which V2 keeps. No `subtask` usage exists. Skills are auto-discovered and their frontmatter is already V2-compatible.
9. **No new runtime id.** The product surface remains `--runtime opencode|kilocode`; V2 is the meaning of `opencode` from this release onward.

## Out of scope

- Migrating consuming repositories' already-committed configs in place.
- Supporting OpenCode 1.x under `--runtime opencode`.
- Pi runtime (#204/#205) and any new agents, skills, commands, or workflow features.
- Provider/model semantics beyond the `provider` → `providers` rename.
- Changing the legacy bash/PowerShell installers to emit V2 artifacts.

## Tasks

### Task 1: Add runtime descriptors and the OpenCode V2 version gate

**Objective:** Centralize runtime-specific artifact decisions in one descriptor and reject unsupported OpenCode versions before install mutates the repo.

**Files:**
- Create: `cli/src/lib/runtimes.ts`
- Modify: `cli/src/commands/install.ts:100-115` (gate after provider/model validation)
- Modify: `cli/src/index.ts:39-40` (help text: opencode = V2)
- Modify: `cli/src/types.ts` if a shape type is exported
- Create: `cli/tests/unit/runtimes.test.ts`
- Validate: `npx vitest run cli/tests/unit/runtimes.test.ts`

**Step 1: Establish expected behaviour**

Define descriptors with these observable values:

| Field | `opencode` | `kilocode` |
|---|---|---|
| `configFile` | `opencode.jsonc` | `kilo.jsonc` |
| `schemaUrl` | `https://opencode.ai/config.json` | `https://app.kilo.ai/config.json` |
| `keys.agents` | `agents` | `agent` |
| `keys.providers` | `providers` | `provider` |
| `keys.plugins` | `plugins` | `plugin` |
| `keys.permissions` | `permissions` | `permission` |
| `pluginEntry(path)` | `{ "package": path }` | `path` |
| `minimumOpenCodeMajor` | `2` | `undefined` |

Version gate behaviour:

- `WAYFORGE_OPENCODE_VERSION=2.1.3` → pass.
- Detected `2.1.3` → pass.
- Detected `1.19.4` → exit 1 with a message naming `@opencode/cli` and the detected version.
- Detected `v1.19.2` (leading `v`) → parse as 1 and fail.
- Command missing → warn and continue assuming V2.
- `--runtime kilocode` → never detects or fails.

**Step 2: Add or update validation**

Create `cli/tests/unit/runtimes.test.ts` covering each row above. Inject the version runner rather than spawning a real binary. Keep assertions on the exact failure text fragments (`OpenCode 2`, `@opencode/cli`, detected version) so the message stays actionable. Validation owner: `agent`.

**Step 3: Write minimal implementation**

Create `cli/src/lib/runtimes.ts` exporting `RuntimeDescriptor`, `RUNTIMES`, `parseMajor`, and `assertRuntimeSupported(runtime, opts?)`. Reuse the `execFileSync` runner pattern from `cli/src/lib/prereq.ts:13-18`. Call the gate from `doInstall` after `validateModelOverride` and before `initManagedManifest`. Do not run detection in dry-run? Run it: a dry-run should report the same incompatibility. Keep the gate side-effect free.

**Step 4: Run test to verify pass**

Run: `npx vitest run cli/tests/unit/runtimes.test.ts` and `npm run typecheck`
Expected: all new tests pass; typecheck clean.

**Step 5: Commit**

`git add cli/src/lib/runtimes.ts cli/src/commands/install.ts cli/src/index.ts cli/src/types.ts cli/tests/unit/runtimes.test.ts`
`git commit -m "feat(cli): add runtime descriptors and OpenCode v2 version gate"`

### Task 2: Generate native OpenCode V2 config and keep Kilo V1 output

**Objective:** Make `generateOpenCodeJsonc` emit V2-native keys and plugin entries for `opencode`, while producing byte-compatible V1 output for `kilocode`.

**Files:**
- Modify: `cli/src/lib/config-gen.ts` (`generateOpenCodeJsonc`, `buildAgentBlockJson`, `buildProviderBlockJson` wrapper handling, `syncGeneratedOpenCodeJsonc`)
- Modify: `cli/package.json` (add `ajv` and `jsonc-parser` to `devDependencies`)
- Create: `cli/tests/fixtures/opencode-v2-config.schema.json` (vendored from <https://opencode.ai/config.json>, 2026-10-22)
- Create: `cli/tests/fixtures/README.md` (schema source, date, refresh procedure)
- Modify: `cli/tests/unit/config-gen.test.ts`
- Validate: `npx vitest run cli/tests/unit/config-gen.test.ts`

**Step 1: Establish expected behaviour**

For `opencode`, the generated file must contain only native V2 keys:

- `"agents"`, `"providers"`, `"plugins"`, `"permissions"`.
- `"plugins": [{ "package": "./.opencode/plugins/ponytail/ponytail.v2.mjs" }]`.
- `"permissions": [{ "action": "skill", "resource": "*", "effect": "allow" }]`.
- No `"agent"`, `"provider"`, `"plugin"`, or top-level `"permission"`.
- `enabled_providers`, `model`, `small_model`, `default_agent`, and `share` stay unchanged.

For `kilocode`, output stays byte-identical to today (singular keys, string plugin path).

**Step 2: Add or update validation**

In `config-gen.test.ts`, parse the generated JSONC with `jsonc-parser` and:

- Validate every `opencode` sample (free-tier, openai, github-copilot, openai+github-copilot, opencode-go, model overrides) against the vendored schema with `ajv` (draft 2020-12).
- Assert the native key presence/absence matrix above.
- Keep the existing kilocode assertions and add a snapshot-style equality check so V1 output does not drift.

Parsing JSONC instead of substring assertions prevents false positives on comments and fragment indentation. Validation owner: `agent`.

**Step 3: Write minimal implementation**

Drive the wrapper keys and schema URL from the descriptor. Keep the six agent fragments unchanged; add a small `rewriteTopLevelKey(fragment, from, to)` helper that replaces only the leading key token (`"agent"` → `"agents"`). Build the plugin section from `descriptor.pluginEntry`. Generate the top-level permission section per shape. Do not change provider/model resolution logic.

**Step 4: Run test to verify pass**

Run: `npx vitest run cli/tests/unit/config-gen.test.ts` and `npm run typecheck`
Expected: V2 samples validate against the schema; kilocode output unchanged; all tests pass.

**Step 5: Commit**

`git add cli/src/lib/config-gen.ts cli/package.json cli/tests/fixtures cli/tests/unit/config-gen.test.ts`
`git commit -m "feat(cli): generate native OpenCode v2 config shape"`

### Task 3: Render agent permissions per runtime shape

**Objective:** Emit V2 ordered permission rules into OpenCode agent frontmatter and keep the V1 map for Kilo Code.

**Files:**
- Modify: `cli/src/lib/permissions.ts` (`renderAgentPermissionBlock`, `renderAgentWithCentralPermissions`, `syncAgentsTreeWithPermissions`)
- Modify: `cli/src/commands/install.ts` (`syncAgentsTreeWithPermissions` and `injectPermissions` call sites)
- Modify: `base/opencode/agents/code.md` (remove `temperature: 0.1`)
- Modify: `cli/tests/unit/permissions.test.ts`
- Validate: `npx vitest run cli/tests/unit/permissions.test.ts`

**Step 1: Establish expected behaviour**

For `opencode`, each agent frontmatter gets:

```yaml
permissions:
  - action: read
    resource: "*"
    effect: allow
  - action: edit
    resource: "*"
    effect: ask
  - action: shell
    resource: "*"
    effect: allow
  - action: shell
    resource: "sudo*"
    effect: deny
```

Rules must preserve `agents.yml` order (catch-all before deny-list; `external_directory` `*` deny before `/tmp/**` allow). `bash` maps to `shell`; `task` maps to `subagent`. `question: allow` becomes a `question` rule. For `kilocode`, keep the existing `permission:` map.

**Step 2: Add or update validation**

Extend `permissions.test.ts`:

- V2: block starts with `permissions:`, contains ordered `- action:` entries, no `bash:`/`task:`/`permission:` keys.
- V2: `external_directory` ordering preserves the `/tmp/**` allow.
- V2: every agent in `agents.yml` renders at least one rule.
- V1: all existing assertions remain under a `kilocode` describe block.
- Frontmatter replacement strips both an old `permission:` map and an old `permissions:` list before inserting the new block.

Validation owner: `agent`.

**Step 3: Write minimal implementation**

Keep the flat-YAML reader and add a shape parameter. Introduce `renderAgentPermissionRules(agentName, permissionsFile)` returning `{ action, resource, effect }[]`, then serialize either YAML map (V1) or YAML list (V2). Thread the descriptor from `GenerateOptions`/install into the sync and inject paths. Remove `temperature` from `code.md`.

**Step 4: Run test to verify pass**

Run: `npx vitest run cli/tests/unit/permissions.test.ts` and `npm run typecheck`
Expected: V2 rule ordering matches the YAML source; V1 output unchanged; tests pass.

**Step 5: Commit**

`git add cli/src/lib/permissions.ts cli/src/commands/install.ts base/opencode/agents/code.md cli/tests/unit/permissions.test.ts`
`git commit -m "feat(cli): render OpenCode v2 agent permissions"`

### Task 4: Add V2 entrypoints for the shipped plugins

**Objective:** Make ponytail, session-tracker, and token-counter load and behave under the V2 plugin API, without breaking their V1 entrypoints for Kilo Code.

**Files:**
- Create: `base/opencode/plugins/ponytail/ponytail.v2.mjs`
- Create: `base/opencode/plugins/session-tracker/index.v2.js`
- Create: `base/opencode/plugins/token-counter/index.v2.js`
- Modify: `base/opencode/plugins/ponytail/package.json`
- Modify: `base/opencode/plugins/session-tracker/package.json`
- Modify: `base/opencode/plugins/token-counter/package.json`
- Create: `cli/tests/unit/plugin-entries.test.ts`
- Validate: `npx vitest run cli/tests/unit/plugin-entries.test.ts`

**Step 1: Establish expected behaviour**

Document the V1 → V2 mapping used by the port:

| Plugin | V1 | V2 |
|---|---|---|
| ponytail | `experimental.chat.system.transform` | `ctx.session.hook("context", e => e.system.push({ type: "text", text }))` |
| ponytail | `command.execute.before` for `/ponytail <mode>` | `ctx.session.hook("prompt", ...)` inspecting the prompt text, or `ctx.command.transform` if the command is registered by the plugin |
| session-tracker | `tool` map + `tool.schema` | `ctx.tool.transform(editor => editor.add({ input: <JSON Schema>, execute }))` |
| session-tracker | `chat.params` | `ctx.session.hook("context", ...)` to capture the active agent |
| session-tracker | `tool.execute.after` | `ctx.tool.hook("execute.after", ...)` |
| session-tracker | `command.execute.before` | `ctx.session.hook("prompt", ...)` |
| session-tracker | `event` | `ctx.event.subscribe({ signal })` |
| token-counter | `tool` map + zod args | `ctx.tool.transform` with a JSON Schema object |
| all | module `server()` export | default export `Plugin.define({ id, setup })` |

Each V2 entrypoint must have a stable `id` (`wayforge.ponytail`, `wayforge.session-tracker`, `wayforge.token-counter`) and reuse existing helpers (`ponytail-config.js`, `ponytail-instructions.js`, `lib/render-table.js`, `gpt-tokenizer`). V1 entries must not import `@opencode/plugin`.

**Step 2: Add or update validation**

Create `plugin-entries.test.ts` that:

- Reads the generated V2 config and asserts every `plugins[].package` path exists in `base/opencode/**`.
- Asserts each V2 entrypoint contains `Plugin.define` and a stable `id`.
- Asserts each `package.json` declares both plugin APIs as optional peers and keeps the existing V1 `main`.

Interactive plugin behaviour cannot be proven by unit tests. Validation owner for the smoke test: `human`. Exact procedure after Task 5: install into a temp repo with OpenCode 2, run `opencode`, confirm all three plugins appear in the plugin/status list, invoke `/ponytail full`, call `token_summary`, call `count_tokens` with a path, and verify counters increase after a tool call.

**Step 3: Write minimal implementation**

Port ponytail first (smallest, prompt-only), then token-counter (one tool), then session-tracker (state + events). Convert `tool.schema` zod definitions to JSON Schema objects with `type`, `properties`, `required`, and `additionalProperties: false`. Keep the in-memory `Map` state; V2 plugin lifetime matches the process and `setup` runs once. Return cleanup functions only where the plugin owns resources (session-tracker event subscription).

**Step 4: Run test to verify pass**

Run: `npx vitest run cli/tests/unit/plugin-entries.test.ts` and `npm run typecheck`
Expected: entrypoint/path assertions pass; no V1 entry imports the V2 package.

**Step 5: Commit**

`git add base/opencode/plugins cli/tests/unit/plugin-entries.test.ts`
`git commit -m "feat(plugins): add OpenCode v2 plugin entrypoints"`

### Task 5: Wire the runtime shape through install/update and cover it with integration assertions

**Objective:** Make fresh installs and manifest refreshes use the descriptor end to end, and prove the V2 output with integration coverage.

**Files:**
- Modify: `cli/src/commands/install.ts` (`GenerateOptions`, agent/plugin sync, `injectPermissions`, update path)
- Modify: `cli/src/commands/interactive.ts` if it constructs `GenerateOptions`
- Modify: `cli/tests/integration/run.sh`
- Validate: `bash cli/tests/integration/run.sh` and `make check`

**Step 1: Establish expected behaviour**

- A fresh `--runtime opencode` install with `WAYFORGE_OPENCODE_VERSION=2.1.3` writes a V2-valid `opencode.jsonc`, V2 agent frontmatter, and the V2 plugin path.
- A second identical install produces no changes (idempotent) and keeps the manifest stable.
- `--runtime kilocode` output matches the pre-change V1 output. Loading it under Kilo CLI 1.0 requires the separate `.kilo/**` routing fix described in Risks; until that exists, only config-shape equality can be asserted.
- `--runtime opencode` with a detected 1.x exits before writing `.wayforge-managed` or `.opencode/**`.

**Step 2: Add or update validation**

Update `run.sh`:

- Export `WAYFORGE_OPENCODE_VERSION=2.1.3` for the TS installs.
- For the `opencode` runtime, replace the legacy-bash diff with assertions: the config parses, V2 keys exist, the schema fixture validates, agent frontmatter starts with `permissions:`, and the plugin path exists.
- Keep the legacy comparison only for `kilocode`, where V1 shape is unchanged.
- Add one negative test: a fake `opencode --version` returning `1.19.4` makes the TS install exit non-zero and leaves the temp repo without `.wayforge-managed`.

Validation owner: `human` for the bash script (Windows host may lack bash); `agent` for `make check` and unit tests.

**Step 3: Write minimal implementation**

Thread the descriptor through `genOpts`, `syncAgentsTreeWithPermissions`, and `injectPermissions`. Ensure the manifest records the V2 plugin entry files (the tree copy already covers `.opencode/plugins/**`). Keep `resolveSourceDir`, provider selection, and model resolution untouched. Do not change the dry-run/force semantics.

**Step 4: Run test to verify pass**

Run: `make check`
Expected: typecheck, lint, format, and duplication pass.
Run (human): `bash cli/tests/integration/run.sh`
Expected: all integration tests pass, including the V2 schema assertions and the V1 rejection case.

**Step 5: Commit**

`git add cli/src/commands/install.ts cli/src/commands/interactive.ts cli/tests/integration/run.sh`
`git commit -m "feat(cli): wire OpenCode v2 runtime shape through install"`

### Task 6: Document the V2 compatibility matrix and the runtime decision

**Objective:** Record the supported runtime/version matrix and the migration decision so consumers and future maintainers do not rediscover it.

**Files:**
- Create: `docs/ai/decisions/ADR-0048-opencode-v2-runtime-shape.md`
- Modify: `docs/ai/architecture.md:7-18` (runtime boundary and generated config description)
- Modify: `README.md:37-59` (runtime requirement, provider key names, plugin entry description)
- Modify: `docs/ai/logs/2026-10.md`
- Validate: `make check`

**Step 1: Establish expected behaviour**

The ADR must state:

- `--runtime opencode` targets OpenCode 2.x and validates against the V2 schema.
- `--runtime kilocode` remains on the V1 shape until Kilo Code ships its own V2.
- OpenCode 1.x is unsupported for `opencode` and fails with a clear message; `WAYFORGE_OPENCODE_VERSION` exists for offline/CI installs.
- Plugin entrypoints are shape-specific (`ponytail.v2.mjs` vs `ponytail.mjs`).
- `temperature` was removed from `code.md` because V2 ignores it.
- Schema snapshot refresh procedure: fetch <https://opencode.ai/config.json>, replace the fixture, rerun `config-gen` tests, and record the date.

**Step 2: Add or update validation**

Cross-check every path and command mentioned in the docs against the repository. Confirm the ADR number does not collide with open PRs (PR #244 reserves ADR-0047). Validation owner: `agent` for path/link existence; `human` for final prose review. `make check` does not lint Markdown, so the human review is required.

**Step 3: Write minimal implementation**

Write the ADR and update the two docs with the matrix and the new plugin/config key names. Do not rewrite unrelated runtime prose. Add one log entry dated 2026-10-22.

**Step 4: Run test to verify pass**

Run: `make check`
Expected: clean. Manually verify each file path quoted in the ADR exists.

**Step 5: Commit**

`git add docs/ai/decisions/ADR-0048-opencode-v2-runtime-shape.md docs/ai/architecture.md README.md docs/ai/logs/2026-10.md`
`git commit -m "docs(ai): record OpenCode v2 runtime compatibility matrix"`

## Risks and assumptions to verify during implementation

**Blocking tracker:** wayforge issue **#247** documents the Kilo project-config security rejection (`{env:...}`) and the shipped `laberit` fragment that triggers it. #226 is marked `status:blocked` via a GitHub dependency on #247, but only for the **kilocode verification/parity** part; the OpenCode V2 runtime tasks (1–3) can proceed independently.

- **V2 hook payloads for session-tracker.** The migration table gives destinations, not exact payloads. The `context` hook may not expose the active agent ID the way V1 `chat.params` did. If it does not, fall back to deriving the agent from session events and document the limitation. Human smoke validation is mandatory before closing Task 4.
- **Local plugin dependency resolution.** It is unverified whether OpenCode 2 resolves a local plugin's `package.json` peers/dependencies. If it does not, the V2 entrypoints must be dependency-free or document the required global install.
- **Schema snapshot drift.** The vendored schema is a point-in-time copy. CI validates against it, so a stale snapshot can pass while upstream changes. The ADR refresh procedure mitigates this.
- **This workstation runs OpenCode 1.19.2.** Task 5 and the Task 4 smoke test require installing `@opencode/cli` or setting `WAYFORGE_OPENCODE_VERSION=2.1.3`; the gate intentionally fails otherwise.
- **Kilo Code target root and config precedence.** Kilo CLI 1.0 expects `kilo.jsonc` plus `.kilo/agents/`, `.kilo/skills/`, `.kilo/plugin/`, and `.kilo/tool/`; it no longer reads project `.opencode/`. wayforge currently writes `.opencode/**` for both runtimes, so the kilocode runtime likely does not load under Kilo CLI 1.0 even before V2. Additionally, a leftover `opencode.json(c)` at the repo root or in `.kilo/` overrides `kilo.jsonc` (#14294, open), so the kilocode install must detect/remove/rename the legacy file or write `.kilo/kilo.jsonc` and verify with `kilo debug config`. Kilo 7.4.x+ also treats project config as untrusted: `{env:VAR}` throws `environment references are not allowed in project config` and `{file:...}` outside the project root is rejected (Kilo PRs #11886/#12168; still current). The shipped `base/opencode/config/providers/laberit-provider-block.jsonc` emits `{env:OPENAI_BASE_URL}`/`{env:OPENAI_API_KEY}`, so a `--runtime kilocode --providers laberit` install produces a `kilo.jsonc` current Kilo refuses. Any kilocode fix must move those values to trusted/global config, use literals, or drop the env-based fragment for kilocode. This is an independent, pre-existing gap. It must be a separate issue (runtime-specific output roots, manifest paths, uninstall, reconcile) unless the maintainer chooses to fold it into #226. Until it is fixed, the #226 acceptance criterion "kilocode installs and loads" cannot be verified; only V1 config-shape equality can.
- **Kilo Code V1 shape.** Kilo's schema file accepts both V1 and V2 keys, but its runtime and plugin API are V1. Do not infer V2 compatibility from the schema. When Kilo's `v2-port` ships, switching the descriptor is a focused follow-up, not an assumption to bake in now.
