---
status: planned
created: 2026-10-22
updated: 2026-10-27
task: 0/6
required_gates:
  architect_review: true
  memory_update: true
---

# OpenCode V2 runtime migration implementation plan (Issue #226)

**Goal:** Make `--runtime opencode` emit native OpenCode 2.x artifacts into the post-#227 `.agents/` layout while `--runtime kilocode` keeps emitting the V1-shaped artifacts that Kilo Code 1.x accepts, and reject an unsupported OpenCode version before any install mutation.

**Architecture:** Extend the single layout declaration introduced by Issue #227 (`cli/src/lib/layout.ts`) into a runtime descriptor that owns the config filename, schema URL, top-level key names, plugin entry shape, and minimum OpenCode major. Config generation, permission rendering, plugin resolution, and install/update consume that descriptor instead of hardcoded `runtime === 'opencode'` conditionals. A preflight version gate runs before `initManagedManifest`. Kilo Code stays on the V1 shape because its current runtime and plugin API are V1.

**Tech Stack:** TypeScript, Node.js >= 18, Commander, fs-extra, vitest, `ajv` 8 (draft 2020-12) as a dev dependency, `make check`.

**Scope classification:** `multi-task`

**Task budget rationale:** six vertical slices because the runtime descriptor, generated config, agent permissions, plugin API surface, install wiring, and durable documentation are independently reviewable deliverables. Merging them would create unstable intermediate states (for example, a V2 config that names plugin directories whose V2 entrypoints do not exist yet). All six share the same descriptor API.

## Revision 2026-10-27

This plan was revised after reviewing the open PR queue and re-verifying upstream. Two earlier assumptions are now wrong and are removed below:

1. The plan is no longer based on `.opencode/**` output or `base/opencode/**` source paths. Open PR **#253 (Issue #227)** moves every installed artifact to `.agents/**` and flattens the source tree to `base/**`. That PR is a hard prerequisite.
2. The old plugin shape `{"package": "./.../ponytail.v2.mjs"}` is invalid in OpenCode V2. V2 ignores a configured local plugin path that names a file; it requires a directory. See "Verified context".

The earlier blocker (#247, laberit `{env:}`) is closed and is no longer a dependency. The repo already enforces the unified `{env:}`-free provider shape and tests it.

## Blocking decisions and required gates

1. **Maintainer dependency decision (2026-10-27): #226 is blocked by #227, #231, and #248** (implemented by PRs #253, #255, and #254). Do not start implementation until all three issues are closed. The GitHub dependency list must be updated to those three issues; the existing link to closed #247 is obsolete. Technically, #227 is the hard prerequisite because it rewrites the layout and paths; #231 and #248 are merge-order gates the maintainer has chosen as hard gates to avoid rebasing the agent/permission fixtures and the integration harness.
2. **Merge-order gates after the dependency decision.** #253 lands first (layout, config generation, pointers, migration, test helper). #255 lands second (agent set, permissions, plan contract, ADR-0048). #254 lands third (legacy installer and test-harness deletion). Rebase #226 onto the merged result before Task 1. If the order changes, rebase rather than reintroducing `.opencode` paths or the old five-step plan format.
3. **Kilo Code routing is resolved by #253, not by this issue.** #253 adds `.kilo/agents` and `.kilo/commands` pointers and points the Kilo plugin/skills config at `.agents/**`, verified against Kilo 7.8.17. This issue therefore does not reopen the `.kilo/**` output-root work. If #253 is rejected, #226 must either absorb that routing fix or remain blocked; that is a maintainer decision.
4. **Plugin strategy: separate V1 and V2 entrypoints plus a directory-resolvable package.** V2 config entries must name plugin directories. Each plugin package keeps `main` for V1 and adds `exports` for V2. The alternative "one module exports both `Plugin.define` and `server`" is rejected because it forces V1 hosts to resolve `@opencode/plugin` at module load.
5. **Integration coverage is vitest, not `run.sh`.** #253 deletes `cli/tests/integration/run.sh` and removes `check-integration`; #254 also rewrites that script. This plan extends the #253 helper (`cli/tests/helpers/install.ts`) and adds a vitest integration test under `cli/tests/integration/`. Do not resurrect the legacy comparison harness.
6. **Version is a release-scheduling decision, not a code dependency.** `VERSION` is `1.0.2` on `develop`, `main`, and the working tree. No open PR bumps it to `1.1.0`; #254's `VERSION` diff removes a trailing newline only. If maintainers intend #227 + #226 to ship together as `1.1.0`, #226 must land before release prep updates `VERSION`, `CHANGELOG.md`, and the tag. Otherwise it ships in the next minor. Do not gate implementation on a `VERSION` value; the only version gate in code is the OpenCode major gate.
7. **Architect review is required before implementation.** It must accept (a) V2-only for `--runtime opencode`, (b) the OpenCode major preflight, (c) the plugin directory + `exports` layout, (d) the `.agents` config paths, and (e) the shape-stale regeneration rule. If the architect rejects the `.agents` pointer approach, re-plan after #253.
8. **Human validation is required before closure.** Unit and vitest checks cannot prove runtime discovery through symlink/junction pointers or plugin loading. Required: OpenCode `@opencode/cli@2.2.0` on one host (agents, commands, skills, all three plugins) and Kilo `7.8.x` on one host (V1 shape still loads).

## Incoming work and impact

All PR state verified 2026-10-27. Every open PR is `mergeable=true` with `mergeable_state=blocked` (branch protection), so none is guaranteed to land first.

| PR | Issue | What it changes | Impact on #226 | Blocking? |
|---|---|---|---|---|
| **#253** | #227 | `.opencode/**` → `.agents/**`; flattens `base/opencode/**` → `base/**`; adds `layout.ts`, `pointers.ts`, migration, `.kilo` pointers; adds `skills` config; deletes `run.sh`/`check-integration`; adds vitest install helper | Invalidates every path and test assumption in the previous plan; supplies the layout declaration this plan extends; resolves Kilo routing | **Yes — dependency** (hard technical prerequisite) |
| **#255** | #231 | Adds `reviewer` agent and config entries; changes `code.md`, `delivery`, `planner`, `research`, `troubleshooter`; adds `/deliver`, `/deliver-plan`, `delivery-policy`; adds `reviewer` and more denies to `agents.yml`; rewrites `plan` skill contract; claims ADR-0048 | Changes the agent set and permission fixtures; keeps `temperature: 0.1` in `code.md`; requires this plan to use a free ADR number | **Yes — dependency** (merge-order gate; technical severity soft) |
| **#254** | #248 | Deletes `install/legacy/**`; rewrites `run.sh` to a TS-only smoke test; removes legacy-only tests; `VERSION` newline-only | Confirms `run.sh` is not a stable surface; no code overlap with #226 | **Yes — dependency** (merge-order gate; no code overlap) |
| **#256** | #243 | Checksum verification in `install.sh` / `install.ps1` | None; release-installer security only | No |
| **#257** | #234 | Plan closeout and `prclose` docs | None | No |
| **#246** | #229 | Draft plan for installer convergence (`collectArtifactPlan`, content registry, drift policy) | No code yet. #226 should keep discovery/descriptor logic in `layout.ts` so the later convergence work does not have to undo it | No |
| **#203** | #202 | `/help` command plus `metadata.workflow` on commands/skills; branch is currently `dirty` | Adds content files only; no runtime shape change | No |

**Issue-dependency decision (2026-10-27):** #226 is blocked by **#227, #231, and #248**, the issues implemented by PRs #253, #255, and #254. GitHub still records only #247, which is closed; the `status:blocked` label is therefore stale in content but correct in intent. The planner cannot mutate work items. A maintainer should replace the #247 dependency with these three and keep the label until all three close. GitHub UI: Issue #226 → Relationships → Blocked by → add #227, #231, #248. GraphQL alternative: three `addBlockedBy` mutations with `issueId` = #226 and `blockingIssueId` = each of the three issue node IDs.

## Verified context (2026-10-27)

Upstream:

- OpenCode V2 ships as `@opencode/cli@2.2.0` (latest at verification); the V1 line ships as `opencode-ai@1.19.4`. The V2 plugin SDK is `@opencode/plugin@2.2.0`. The local workstation still has `opencode --version` = `1.19.2`, so local installs must set `WAYFORGE_OPENCODE_VERSION` or install the V2 CLI.
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
- The live V2 schema is `https://opencode.ai/config.json` (66 KB at verification). Its only external `$ref` is `https://models.dev/model-schema.json#/$defs/Model` on `small_model` (382 KB). The test fixture will replace that one ref with `{"type": "string"}` and document the transform.

Repository facts expected after #253 lands:

- `cli/src/lib/layout.ts` declares `ARTIFACT_ROOT = '.agents'`, `LEGACY_ARTIFACT_ROOT = '.opencode'`, `CONTENT_CATEGORIES`, `RUNTIME_POINTER_DIRS`, `CONFIG_FILES`, `RUNTIMES`, `PLUGIN_ENTRY`, `SKILLS_CONFIG_PATH`, `sourceDirFor`, `destRelFor`, `pointerPathsFor`, and `configFileFor`.
- `cli/src/commands/install.ts` gates on Node, then resolves the source, validates providers/models, builds `GenerateOptions`, calls `initManagedManifest`, and later `syncGeneratedOpenCodeJsonc`, `syncAgentsTreeWithPermissions`, category synchronization, and `ensureRuntimePointers`.
- `cli/src/lib/config-gen.ts` still emits singular `"agent"`, `"provider"`, `"plugin"`, `"permission"` and now emits `"skills": ["./.agents/skills"]`.
- `cli/src/lib/permissions.ts` renders only the V1 `permission:` map. `install.ts` calls it for both runtimes.
- `base/agents/code.md` still declares `temperature: 0.1` (also true in open PR #255).
- `base/plugins/ponytail/package.json`, `session-tracker/package.json`, and `token-counter/package.json` declare only `main` and the V1 peer `@opencode-ai/plugin`.
- `cli/package.json` has no `ajv`. Generated config is strict JSON after the single header comment, so tests can strip the header and use `JSON.parse`; `jsonc-parser` is not required.
- #253 replaces the integration script with `cli/tests/helpers/install.ts` + `cli/tests/integration/install-layout.test.ts`; `Makefile` no longer has `check-integration`.
- ADR numbers: ADR-0046 is added by #253, ADR-0047 exists, and ADR-0048 is claimed by open PR #255. Use **ADR-0049** for this plan (or ADR-0048 only if #255 is abandoned before implementation).
- `VERSION` is `1.0.2` everywhere; no branch or PR targets `1.1.0`. GitHub records #226 `blockedBy` #247 (closed).

## Resolved decisions

1. **V2-only for `--runtime opencode`.** Native V2 artifacts. If the installed `opencode` major is `< 2`, install fails before mutation with an actionable message. V1 config translation is not a compatibility path.
2. **Kilo Code stays V1-shaped.** `--runtime kilocode` keeps `agent`/`provider`/`plugin`/`permission`, the Kilo schema URL, and the `.kilo` pointers supplied by #253. No OpenCode version gate for kilocode.
3. **Version detection.** Read `WAYFORGE_OPENCODE_VERSION` when set; otherwise run `opencode --version`. Missing or unparsable output logs a warning and assumes V2. Parsed major `< 2` fails. The env override is the offline/CI escape hatch. A leading `v` is accepted.
4. **JSONC stays the output format.** The managed header remains. Schema validation is a test-time concern using a vendored V2 schema snapshot, not a runtime fetch.
5. **One plugin package, two entrypoints.** Keep the V1 entrypoints and add V2 entrypoints that import `@opencode/plugin` and reuse the existing pure helpers. `package.json` keeps `main` for V1 and adds `exports["."]` for V2.
6. **All three plugins are explicit in both runtime configs.** The #253 layout no longer places plugins under a runtime-discovered `.opencode/plugins/` directory. The config must list `ponytail`, `session-tracker`, and `token-counter` explicitly for both `opencode` and `kilocode`. This also restores Kilo loading for the two plugins that previously relied on auto-discovery.
7. **Permissions are translated, not duplicated.** Extend the existing YAML reader to emit an ordered V2 rule list for `opencode`, preserving YAML order and mapping `bash → shell`, `task → subagent`. Kilo keeps the V1 map.
8. **Legacy `temperature` is removed.** `base/agents/code.md` drops `temperature: 0.1`; V2 has no supported equivalent. Kilo loses that setting.
9. **Commands and skills need no shape change.** Command frontmatter uses `description`/`agent`, which V2 keeps. No `subtask` usage exists. Skills are discovered from `.agents/skills`; V2 accepts the existing `name`/`description`/`compatibility`/`metadata` fields.
10. **No new runtime id.** The product surface remains `--runtime opencode|kilocode`; V2 is the meaning of `opencode` from this release onward.
11. **Stale config regeneration is part of the change.** A managed `opencode.jsonc` written by the previous wayforge release (V1 shape, `.agents` paths) must be regenerated on upgrade even without `--force`, because it names a V1 plugin file and singular keys. `isLayoutStaleConfig` from #253 is extended into a runtime-aware `isRuntimeConfigStale(runtime, file)`.

## Out of scope

- Migrating consuming repositories' already-committed configs in place.
- Supporting OpenCode 1.x under `--runtime opencode`.
- Pi runtime (#204/#205) and any new agents, skills, commands, or workflow features unrelated to #226.
- Removing or replacing the deprecated `enabled_providers` / `small_model` keys.
- Reopening the `.kilo/**` routing work owned by #227.
- Changing the legacy release installers (`install/install.sh`, `install/install.ps1`).
- Resurrecting `cli/tests/integration/run.sh`.

## Tasks

> Paths below assume PR #253 has merged (`base/**`, `.agents/**`, `layout.ts`, vitest helper). If #253 is not merged, stop and re-plan.

### Task 1: Extend the layout declaration with runtime shapes and add the OpenCode V2 preflight

**Objective:** Centralize runtime-specific artifact decisions in `layout.ts` and reject unsupported OpenCode versions before install mutates the repo.

**Files:**
- Modify: `cli/src/lib/layout.ts` (add `RuntimeShape`, `RUNTIME_SHAPES`, `schemaUrlFor`, `pluginEntriesFor`, `minimumOpenCodeMajor`)
- Create: `cli/src/lib/runtime-version.ts`
- Modify: `cli/src/commands/install.ts` (gate after provider/model validation, before `initManagedManifest`)
- Modify: `cli/src/index.ts` (help text: opencode = OpenCode 2.x; kilocode = Kilo Code 1.x-compatible)
- Create: `cli/tests/unit/runtime-version.test.ts`
- Validate: `npx vitest run cli/tests/unit/runtime-version.test.ts`

**Step 1: Establish expected behaviour**

Descriptor values:

| Field | `opencode` | `kilocode` |
|---|---|---|
| `configFile` | `opencode.jsonc` | `kilo.jsonc` |
| `schemaUrl` | `https://opencode.ai/config.json` | `https://app.kilo.ai/config.json` |
| `keys.agents` | `agents` | `agent` |
| `keys.providers` | `providers` | `provider` |
| `keys.plugins` | `plugins` | `plugin` |
| `keys.permissions` | `permissions` | `permission` |
| `pluginEntries` | `./.agents/plugins/{ponytail,session-tracker,token-counter}` (directories) | `./.agents/plugins/ponytail/ponytail.mjs`, `./.agents/plugins/session-tracker/index.js`, `./.agents/plugins/token-counter/index.js` (files) |
| `minimumOpenCodeMajor` | `2` | `undefined` |

Version gate behaviour:

- `WAYFORGE_OPENCODE_VERSION=2.2.0` → pass.
- Detected `2.2.0` → pass.
- Detected `1.19.4` → exit 1 with a message naming `@opencode/cli`, the detected version, and `WAYFORGE_OPENCODE_VERSION`.
- Detected `v1.19.2` → parse as 1 and fail.
- Command missing or output unparsable → warn and continue assuming V2.
- `--runtime kilocode` → never detects or fails.
- Dry-run runs the same gate and reports the same incompatibility.

**Step 2: Add or update validation**

Create `cli/tests/unit/runtime-version.test.ts` covering every row above. Inject the version runner instead of spawning a real binary. Assert exact failure-text fragments (`OpenCode 2`, `@opencode/cli`, detected version, `WAYFORGE_OPENCODE_VERSION`). Validation owner: `agent`.

**Step 3: Write minimal implementation**

Add the shape data to `layout.ts` and export `RUNTIME_SHAPES`; do not create a second `RUNTIMES`/`CONFIG_FILES` table. Create `runtime-version.ts` exporting `parseRuntimeMajor`, `detectOpenCodeVersion`, and `assertRuntimeSupported(runtime, opts?)`, reusing the `execFileSync` runner pattern from `cli/src/lib/prereq.ts`. Call the gate in `doInstall` after `validateModelOverride` calls and before `initManagedManifest`. Keep the gate side-effect free. Do not run detection for kilocode.

**Step 4: Run test to verify pass**

Run: `npx vitest run cli/tests/unit/runtime-version.test.ts` and `npm run typecheck`
Expected: all new tests pass; typecheck clean.

**Step 5: Commit**

`git add cli/src/lib/layout.ts cli/src/lib/runtime-version.ts cli/src/commands/install.ts cli/src/index.ts cli/tests/unit/runtime-version.test.ts`
`git commit -m "feat(cli): add runtime shapes and OpenCode v2 preflight"`

### Task 2: Generate native OpenCode V2 config and keep Kilo V1 output

**Objective:** Make config generation emit V2-native keys, directory plugin entries, and V2 permission rules for `opencode`, while producing the expected V1 output for `kilocode`.

**Files:**
- Modify: `cli/src/lib/config-gen.ts` (`generateOpenCodeJsonc`, `buildAgentBlockJson`, `syncGeneratedOpenCodeJsonc`, `isLayoutStaleConfig` → `isRuntimeConfigStale`)
- Modify: `cli/package.json` (add `ajv` to `devDependencies`)
- Create: `cli/tests/fixtures/opencode-v2-config.schema.json` (vendored from <https://opencode.ai/config.json>, 2026-10-27)
- Create: `cli/tests/fixtures/README.md` (schema source, date, the one `$ref` transform, refresh procedure)
- Modify: `cli/tests/unit/config-gen.test.ts`
- Validate: `npx vitest run cli/tests/unit/config-gen.test.ts`

**Step 1: Establish expected behaviour**

For `opencode`, the generated file contains only native V2 keys:

- `"agents"`, `"providers"`, `"plugins"`, `"permissions"`.
- `"plugins": ["./.agents/plugins/ponytail", "./.agents/plugins/session-tracker", "./.agents/plugins/token-counter"]`.
- `"permissions": [{ "action": "skill", "resource": "*", "effect": "allow" }]`.
- `"skills": ["./.agents/skills"]`.
- No `"agent"`, `"provider"`, `"plugin"`, or top-level `"permission"`.
- `enabled_providers`, `model`, `small_model`, `default_agent`, and `share` stay unchanged.

For `kilocode`, output keeps singular keys, the Kilo schema, `"skills": ["./.agents/skills"]`, and a file-based plugin list with all three plugins:

```jsonc
"plugin": [
  "./.agents/plugins/ponytail/ponytail.mjs",
  "./.agents/plugins/session-tracker/index.js",
  "./.agents/plugins/token-counter/index.js"
]
```

Upgrade rule:

- `isRuntimeConfigStale('opencode', file)` returns true for a managed config that contains `.opencode/`, lacks `"skills"`, lacks any of `"agents"`/`"providers"`/`"plugins"`/`"permissions"`, or contains `"agent"`/`"provider"`/`"plugin"`/`"permission"`.
- `isRuntimeConfigStale('kilocode', file)` keeps the #253 layout checks only.
- A stale managed config is regenerated even without `--force`; an unmanaged existing file is still preserved according to the existing skip policy.

**Step 2: Add or update validation**

In `config-gen.test.ts`:

- Parse the generated config by stripping the first header line and calling `JSON.parse` (no `jsonc-parser` dependency).
- Validate every `opencode` sample (free-tier, openai, github-copilot, openai+github-copilot, opencode-go, laberit, openai+github-copilot+laberit+opencode-go, model overrides) against the vendored schema with `ajv/dist/2020`.
- Assert the native key presence/absence matrix above.
- Assert the plugin entry is a directory for `opencode` and a file list for `kilocode`.
- Assert `isRuntimeConfigStale` regenerates a V1-shaped `opencode.jsonc` and leaves a kilocode config alone.
- Keep the existing `{env:}`/`{file:}` absence assertion for both runtimes.
- Add a snapshot-style equality check for the kilocode V1 shape so it does not drift.

The vendored schema is derived from the live schema with one documented change: the external `small_model` `$ref` to `https://models.dev/model-schema.json#/$defs/Model` is replaced by `{"type": "string"}` to keep validation offline. Do not silently drop other constraints. Validation owner: `agent`.

**Step 3: Write minimal implementation**

Drive schema URL, wrapper keys, plugin entries, and the permission section from `RUNTIME_SHAPES`. Keep the seven agent fragments unchanged; add a small `rewriteTopLevelKey(fragment, from, to)` helper that replaces only the leading key token (`"agent"` → `"agents"`) for the opencode runtime. Build the plugin section from `pluginEntriesFor(runtime)`. Do not change provider/model resolution logic. Extend `isLayoutStaleConfig` without breaking the #253 migration tests.

**Step 4: Run test to verify pass**

Run: `npx vitest run cli/tests/unit/config-gen.test.ts` and `npm run typecheck`
Expected: V2 samples validate against the schema and the key matrix; kilocode output matches the V1 snapshot; all tests pass.

**Step 5: Commit**

`git add cli/src/lib/config-gen.ts cli/package.json cli/tests/fixtures cli/tests/unit/config-gen.test.ts`
`git commit -m "feat(cli): generate native OpenCode v2 config shape"`

### Task 3: Render agent permissions per runtime shape

**Objective:** Emit V2 ordered permission rules into OpenCode agent frontmatter and keep the V1 map for Kilo Code.

**Files:**
- Modify: `cli/src/lib/permissions.ts` (`renderAgentPermissionBlock`, `renderAgentWithCentralPermissions`, `syncAgentsTreeWithPermissions`)
- Modify: `cli/src/commands/install.ts` (`syncAgentsTreeWithPermissions` and `injectPermissions` call sites)
- Modify: `base/agents/code.md` (remove `temperature: 0.1`)
- Modify: `cli/tests/unit/permissions.test.ts`
- Validate: `npx vitest run cli/tests/unit/permissions.test.ts`

**Step 1: Establish expected behaviour**

For `opencode`, each agent frontmatter gets an ordered list, for example:

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

Rules must preserve `agents.yml` order (catch-all before deny-list; `external_directory` `*` deny before `/tmp/**` allow). Mapping:

| YAML | V2 action |
|---|---|
| `read` / `edit` / `question` | same |
| `bash` | `shell` |
| `external_directory` | same |
| `task` | `subagent` |

Scalar permissions (`edit: ask`, `task: deny`) become one rule with `resource: "*"`. For `kilocode`, keep the existing `permission:` map. The renderer must cover every agent in `agents.yml`, including `reviewer` when #255 lands, without hardcoded agent names.

**Step 2: Add or update validation**

Extend `permissions.test.ts`:

- V2: block starts with `permissions:`, contains ordered `- action:` entries, and no `bash:`/`task:`/`permission:` keys.
- V2: every agent in `agents.yml` renders at least one rule.
- V2: `external_directory` ordering preserves the `/tmp/**` allow.
- V2: each V1 action name maps to the expected V2 action.
- V1: all existing `permission:` map assertions remain under a `kilocode` describe block.
- Frontmatter replacement strips both an old `permission:` map and an old `permissions:` list before inserting the new block.
- `code.md` contains no `temperature:` field.

Validation owner: `agent`.

**Step 3: Write minimal implementation**

Keep the flat-YAML reader and add a runtime-shape parameter. Introduce `renderAgentPermissionRules(agentName, permissionsFile)` returning `{ action, resource, effect }[]`, then serialize either the YAML map (V1) or the YAML list (V2). Thread the descriptor from `GenerateOptions`/install into the sync and inject paths. Remove `temperature` from `base/agents/code.md`.

**Step 4: Run test to verify pass**

Run: `npx vitest run cli/tests/unit/permissions.test.ts` and `npm run typecheck`
Expected: V2 rule ordering matches the YAML source; V1 output unchanged; all tests pass.

**Step 5: Commit**

`git add cli/src/lib/permissions.ts cli/src/commands/install.ts base/agents/code.md cli/tests/unit/permissions.test.ts`
`git commit -m "feat(cli): render OpenCode v2 agent permissions"`

### Task 4: Add V2 entrypoints for the shipped plugins

**Objective:** Make ponytail, session-tracker, and token-counter load and behave under the V2 plugin API without breaking their V1 entrypoints for Kilo Code.

**Files:**
- Create: `base/plugins/ponytail/ponytail.v2.mjs`
- Create: `base/plugins/session-tracker/index.v2.js`
- Create: `base/plugins/token-counter/index.v2.js`
- Modify: `base/plugins/ponytail/package.json`
- Modify: `base/plugins/session-tracker/package.json`
- Modify: `base/plugins/token-counter/package.json`
- Create: `cli/tests/unit/plugin-entries.test.ts`
- Validate: `npx vitest run cli/tests/unit/plugin-entries.test.ts`

**Step 1: Establish expected behaviour**

V1 → V2 mapping used by the port:

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

Package metadata:

- Keep `main` for V1.
- Add `exports: { ".": "./<v2-entry>" }` so V2 directory resolution is deterministic.
- Declare both `@opencode-ai/plugin` and `@opencode/plugin` as peers; note that wayforge copies local plugins and does not install package dependencies.

**Step 2: Add or update validation**

Create `plugin-entries.test.ts` that:

- Reads the generated V2 and V1 configs and asserts every plugin path exists under `base/plugins/**`.
- Asserts the V2 entries are directories and the V1 entries are files.
- Asserts each V2 entrypoint contains `Plugin.define` and a stable `id`.
- Asserts each `package.json` declares both plugin APIs as peers, keeps the existing V1 `main`, and adds `exports`.
- Asserts no V1 entrypoint imports `@opencode/plugin`.

Interactive plugin behaviour cannot be proven by unit tests. Validation owner for the smoke test: `human`. Exact procedure after Task 5: install into a temp repo with OpenCode 2.2.0, run `opencode`, confirm all three plugin IDs appear in the plugin/status list, invoke `/ponytail full`, call `token_summary`, call `count_tokens` with a path, and verify counters increase after a tool call. Repeat the Kilo check on 7.8.x to confirm the V1 entries still load.

**Step 3: Write minimal implementation**

Port ponytail first (smallest, prompt-only), then token-counter (one tool), then session-tracker (state + events). Convert `tool.schema` zod definitions to JSON Schema objects with `type`, `properties`, `required`, and `additionalProperties: false`. Keep the in-memory `Map` state; V2 plugin lifetime matches the process and `setup` runs once. Return cleanup functions only where the plugin owns resources (session-tracker event subscription). Do not change V1 hook behavior.

**Step 4: Run test to verify pass**

Run: `npx vitest run cli/tests/unit/plugin-entries.test.ts` and `npm run typecheck`
Expected: entrypoint/path assertions pass; no V1 entry imports the V2 package.

**Step 5: Commit**

`git add base/plugins cli/tests/unit/plugin-entries.test.ts`
`git commit -m "feat(plugins): add OpenCode v2 plugin entrypoints"`

### Task 5: Wire the runtime shape through install/update and cover it with vitest integration tests

**Objective:** Make fresh installs, migrations, and refreshes use the descriptor end to end, and prove the V2 output with the post-#253 vitest harness.

**Files:**
- Modify: `cli/src/commands/install.ts` (`GenerateOptions`, agent/plugin sync, `injectPermissions`, refresh path)
- Modify: `cli/src/commands/interactive.ts` if it constructs `GenerateOptions`
- Modify: `cli/tests/helpers/install.ts` (V2 env override and descriptor-aware helpers)
- Create: `cli/tests/integration/install-v2.test.ts`
- Modify: `cli/tests/integration/install-layout.test.ts` (from #253) if V1 expectations change
- Validate: `npx vitest run cli/tests/integration/install-v2.test.ts` and `make check`

**Step 1: Establish expected behaviour**

- A fresh `--runtime opencode` install with `WAYFORGE_OPENCODE_VERSION=2.2.0` writes:
  - a V2-valid `opencode.jsonc` with `.agents` paths,
  - V2 agent frontmatter in `.agents/agents/*.md`,
  - `.opencode/agents` and `.opencode/commands` pointers,
  - all three plugin entries as directories.
- A second identical install produces no changes (idempotent) and keeps the manifest stable.
- A refresh over a post-#227 V1-shaped `opencode.jsonc` regenerates it to V2 shape without `--force` because `isRuntimeConfigStale` returns true.
- A refresh over a pre-#227 `.opencode` install still migrates to `.agents` and then writes V2 shape.
- `--runtime opencode` with a detected or configured 1.x exits before writing `.wayforge-managed`, `.agents/**`, or pointers.
- `--runtime kilocode` keeps the V1 config shape, writes `.kilo/agents` and `.kilo/commands` pointers (from #253), and lists all three V1 plugin entries.
- `WAYFORGE_OPENCODE_VERSION` is the only mechanism used by tests; do not depend on the host binary being V2.

**Step 2: Add or update validation**

Extend the #253 helper and add `install-v2.test.ts`:

- Use `doInstall(installOptions(...))` or the CLI in a temp repo, with `vi.stubEnv('WAYFORGE_OPENCODE_VERSION', '2.2.0')`.
- Assert the V2 key matrix, schema validation, agent frontmatter, plugin paths, and pointer existence.
- Assert idempotency by hashing the generated config and agent files across two installs.
- Add the negative gate test: `WAYFORGE_OPENCODE_VERSION=1.19.4` makes the install exit non-zero and leaves the temp repo without `.wayforge-managed`.
- Add the stale-V1-config upgrade test.
- Keep the #253 migration and pointer tests green.

Validation owner: `agent` for vitest and `make check`; `human` for the real OpenCode 2.2.0 and Kilo 7.8.x load checks.

**Step 3: Write minimal implementation**

Thread the descriptor through `genOpts`, `syncAgentsTreeWithPermissions`, and `injectPermissions`. Ensure the refresh path regenerates stale configs per runtime and keeps the existing `--force` semantics. Do not change pointer creation, provider selection, model resolution, or #253's migration helpers.

**Step 4: Run test to verify pass**

Run: `npx vitest run cli/tests/integration/install-v2.test.ts`
Run: `make check`
Expected: typecheck, lint, format, duplication, and all vitest files pass.

**Step 5: Commit**

`git add cli/src/commands/install.ts cli/src/commands/interactive.ts cli/tests/helpers/install.ts cli/tests/integration/install-v2.test.ts cli/tests/integration/install-layout.test.ts`
`git commit -m "feat(cli): wire OpenCode v2 runtime shape through install"`

### Task 6: Document the compatibility matrix, version gate, and runtime decision

**Objective:** Record the supported runtime/version matrix, the `.agents` layout interaction, and the migration decision so consumers and future maintainers do not rediscover it.

**Files:**
- Create: `docs/ai/decisions/ADR-0049-opencode-v2-runtime-shape.md` (ADR-0048 is claimed by open PR #255)
- Modify: `docs/ai/architecture.md` (runtime boundary, `.agents` layout, generated config description)
- Modify: `docs/compatibility-matrix.md` (from #253: OpenCode column is V2 2.2.0; Kilo 7.8.x is V1; Pi unchanged)
- Modify: `README.md` (runtime requirement, version gate, provider key names, plugin entry description)
- Modify: `CHANGELOG.md` (add a bullet under the merged `[Unreleased]` section)
- Modify: `docs/ai/logs/2026-10.md`
- Validate: `make check`

**Step 1: Establish expected behaviour**

The ADR must state:

- `--runtime opencode` targets OpenCode 2.x and validates against the V2 schema.
- `--runtime kilocode` remains on the V1 shape until Kilo Code ships its own V2 runtime/plugin API.
- OpenCode 1.x is unsupported for `opencode` and fails before mutation; `WAYFORGE_OPENCODE_VERSION` is the offline/CI escape hatch.
- The installed artifact root is `.agents/`; OpenCode reaches agents/commands through `.opencode` pointers, skills through `.agents/skills`, and plugins through explicit directory entries.
- Plugin entrypoints are shape-specific (`ponytail.mjs` vs `ponytail.v2.mjs`, etc.).
- All three plugins are explicit config entries; the old `.opencode/plugins/` auto-discovery assumption no longer holds.
- `temperature` was removed from `code.md` because V2 ignores/rejects it.
- Stale V1-shaped `opencode.jsonc` files are regenerated on upgrade.
- Schema snapshot refresh procedure: fetch <https://opencode.ai/config.json>, replace the external `small_model` ref with `{"type":"string"}`, update the fixture date, rerun config-gen tests, record the date.
- `enabled_providers` / `small_model` are deprecated in the V2 schema but retained; removing them is a separate decision.
- Wayforge's own `VERSION` (`1.0.2` at planning time) is unrelated to the OpenCode runtime major; do not conflate them.

**Step 2: Add or update validation**

Cross-check every path and command mentioned in the docs against the repository. Confirm the ADR number does not collide with open PRs (#253 uses ADR-0046; #255 claims ADR-0048). Validation owner: `agent` for path/link existence; `human` for final prose review. `make check` does not lint Markdown.

**Step 3: Write minimal implementation**

Write the ADR and update the docs with the matrix and the new plugin/config key names. Do not rewrite unrelated runtime prose. Add one log entry dated the implementation date. If #254/#255 have landed, append to their `[Unreleased]` section rather than creating a second heading.

**Step 4: Run test to verify pass**

Run: `make check`
Expected: clean. Manually verify each file path quoted in the ADR exists.

**Step 5: Commit**

`git add docs/ai/decisions/ADR-0049-opencode-v2-runtime-shape.md docs/ai/architecture.md docs/compatibility-matrix.md README.md CHANGELOG.md docs/ai/logs/2026-10.md`
`git commit -m "docs(ai): record OpenCode v2 runtime compatibility matrix"`

## Risks and assumptions to verify during implementation

- **Pointer traversal under V2 is unverified.** #253 verified `.opencode` pointers with OpenCode 1.18.35 only. V2 must discover agents and commands through a symlink or junction. If V2 does not traverse them, the fallback is a generated stub or another runtime-specific pointer, and #227's "no duplication" rule must be revisited. This is a blocking human verification before Task 5 closes.
- **V2 hook payloads for session-tracker.** The migration table gives destinations, not exact payloads. `ctx.session.hook("context", ...)` may not expose the active agent the way V1 `chat.params` did. Fall back to deriving the agent from session events and document the limitation. Human smoke validation is mandatory.
- **Ponytail command interception.** V2 `command.execute.before` has no global one-to-one hook. The prompt hook may observe the raw `/ponytail full` prompt before command expansion, or it may not. Verify with the real runtime; if it fails, register a command transform or document the limitation.
- **Local plugin dependency resolution.** It is unverified whether OpenCode 2 resolves a local plugin's `package.json` peers/dependencies. If it does not, the V2 entrypoints must be dependency-free or document the required global install.
- **Plugin `exports` may affect V1 discovery.** V1 config entries name files directly, so `exports` should be inert, but verify both OpenCode 1.x and Kilo 7.8.x after adding it.
- **Schema snapshot drift.** The vendored schema is a point-in-time copy with one documented external-ref substitution. CI validates against the fixture, so a stale fixture can pass while upstream changes. The ADR refresh procedure mitigates this.
- **This workstation runs OpenCode 1.19.2.** Unit/integration tests use `WAYFORGE_OPENCODE_VERSION=2.2.0`; the gate intentionally fails real local installs until `@opencode/cli` 2.2.0 is installed or the env override is set.
- **Kilo Code target is V1.** Kilo 7.8.x accepts the V1 shape and the `.kilo` pointers verified by #253. Do not infer V2 support from the hybrid `app.kilo.ai` schema. When Kilo's V2 port ships, switching the descriptor is a focused follow-up.
- **Merge-train conflicts.** #253, #254, and #255 all touch `base/**`, `Makefile`, `CHANGELOG.md`, and the test harness. The #226 branch must be rebased after they land; do not resolve conflicts by reintroducing `.opencode` paths or the old five-step plan format.
- **Plan-format drift from #255.** If #255 merges before implementation, normalize this plan to the outcome-based task contract (per-task acceptance criteria, `Depends on`, `Status`). The task boundaries and acceptance criteria above are already compatible.
