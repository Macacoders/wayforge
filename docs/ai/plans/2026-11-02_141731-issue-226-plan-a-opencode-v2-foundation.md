---
status: planned
created: 2026-11-02
updated: 2026-11-02
task: 4/5
sequence: A
issue: 278
parent_issue: 226
blocks: feature/issue-279-opencode-v2-migration (commit fd3a586, unmerged plan doc)
required_gates:
  architect_review: true
  memory_update: true
---

# OpenCode V2 foundation (Plan A) — Issue #226

**Tracking:** GitHub issue #278, child of #226.

**Goal:** Add the runtime-shape descriptor, the OpenCode 2.x preflight, the offline V2 schema harness, and runtime-aware stale-config detection that the OpenCode V2 migration will consume, without changing the artifacts wayforge emits yet.

**Architecture:** Extend the single layout declaration in `cli/src/lib/layout.ts` with `RuntimeShape` / `RUNTIME_SHAPES`, which own the config filename, schema URL, top-level key names, plugin entries, and minimum OpenCode major. Add a side-effect-free `runtime-version.ts` that detects the OpenCode major and fails before any install mutation. Add a vendored V2 schema fixture plus an Ajv harness that later validates generated configs offline. Add `isRuntimeConfigStale(runtime, file)` for the migration, but do not wire it into install yet.

**Tech Stack:** TypeScript, Node.js >= 18, Commander, fs-extra, vitest, `ajv` 8 (draft 2020-12) as a CLI dev dependency, `make check`.

**Scope classification:** `multi-task`

**Task budget rationale:** five slices because the descriptor, the version gate, the install wiring, the offline schema harness, and the stale-config rule are independently reviewable and independently testable. Plan A is deliberately emission-neutral: config generation output, permissions, plugin entrypoints, and install/update descriptor threading stay unchanged so every intermediate commit is shippable. Plan B (deferred) owns the migration itself.

## Plan A / Plan B boundary

| Concern | Plan A (this plan) | Plan B (deferred) |
|---|---|---|
| Runtime descriptor | Add `RuntimeShape`, `RUNTIME_SHAPES`, `schemaUrlFor`, `pluginEntriesFor` | Consume it in config generation and install/update |
| OpenCode version gate | Add `runtime-version.ts` and wire the gate into `doInstall` | No further gate work |
| Schema validation | Vendor the V2 schema and add an offline Ajv harness | Validate every generated V2 config sample with it |
| Config generation | **Unchanged output** (both runtimes keep the current shape); Task 1 swaps the literal schema-URL ternary for `schemaUrlFor` with byte-identical output | Native V2 keys + Kilo V1 snapshot |
| Agent permissions | **Unchanged** | V2 rule list + remove `temperature` |
| Plugin entrypoints | Descriptor lists the intended entries only | Add V2 entrypoints, `exports`, and plugin-entry tests |
| Stale detection | Add `isRuntimeConfigStale` + unit tests, **not wired** | Wire it through install/update after V2 emission lands |
| ADR/docs | No ADR in Plan A | ADR-0049, architecture, matrix, README, changelog, log |

> **Why the descriptor lands before emission.** A V2 config that names `./.agents/plugins/...` directories is only valid once the V2 entrypoints exist. Landing the descriptor, gate, schema harness, and stale rule first avoids an unstable intermediate release where the generated config references plugin entrypoints Plan B has not created yet.

## Kilo Code impact

"V2" in this plan means OpenCode 2.x only. Kilo Code V2 has not shipped at the time of planning, and Plan A does not assume it has.

- `RUNTIME_SHAPES.kilocode` keeps the V1 contract: `kilo.jsonc`, `https://app.kilo.ai/config.json`, singular keys (`agent`, `provider`, `plugin`, `permission`), file-based plugin entries, and `minimumOpenCodeMajor: undefined`.
- The preflight is a no-op for `--runtime kilocode`: it never runs `opencode --version` and never fails because of `WAYFORGE_OPENCODE_VERSION`.
- Plan A changes no Kilo output. The descriptor addition is data and tests only; config generation, permissions, and plugin files are untouched.
- Kilo 7.8.x remains the supported target. The future Kilo V2 migration is tracked by issue #277; its plan document lives on branch `feature/issue-277-kilo-code-v2-migration` (commit `3f0fe26`, pushed to origin but not merged into `develop`). It is blocked until Kilo ships V2.

## Verified context (2026-11-02)

This is the subset Plan A needs. The full upstream and PR analysis lives in the deferred Plan B document on branch `feature/issue-279-opencode-v2-migration` (commit `fd3a586`, pushed to origin but not merged into `develop`); it is not present at Plan A's HEAD, so do not treat it as a local file reference until that branch merges.

### Upstream

- OpenCode V2 ships as `@opencode/cli@2.2.5`; the V1 line ships as `opencode-ai@1.19.5`. The V2 plugin SDK is `@opencode/plugin@2.2.5`. The local workstation has `opencode --version` = `1.19.5`, so local installs against this repo must set `WAYFORGE_OPENCODE_VERSION` or install the V2 CLI.
- V2 native top-level keys: `agents`, `providers`, `plugins`, `permissions`, `commands`, `skills`. The V2 schema still accepts the V1 singular keys as deprecated aliases, so schema acceptance alone cannot prove the native shape. Tests must assert key presence and absence explicitly.
- V2 permission rules are `{ action, resource, effect }`, last match wins. `bash` becomes `shell`; `task` becomes `subagent`; `permission` becomes `permissions`. Plan A does not render these rules; Plan B does.
- V2 agent frontmatter rejects `temperature`, `top_p`, `prompt`, `permission`, `tools`, `disable`, and `maxSteps`. Plan A does not change frontmatter; Plan B does.
- **V2 local plugin entries must name directories.** A configured local path that names a single file is skipped. A local plugin directory with `package.json` `name` + `exports` loads through `exports`; without those, V2 falls back to root files named `server` (else `index`) with `.ts`/`.tsx`/`.js`.
- V2 auto-discovers plugins under `.opencode/plugins/` but does **not** auto-discover `.agents/plugins/`. Every shipped plugin must be listed explicitly in the V2 `plugins` array.
- The live V2 schema is `https://opencode.ai/config.json`. Its only external `$ref` is `https://models.dev/model-schema.json#/$defs/Model` on `small_model`. The fixture replaces that one ref with `{"type": "string"}` and documents the transform.

### Repository facts

- `cli/src/lib/layout.ts` currently declares `ARTIFACT_ROOT`, `LEGACY_ARTIFACT_ROOT`, `CONTENT_CATEGORIES`, `RUNTIME_POINTER_DIRS`, a private `CONFIG_FILES` table, `RUNTIMES`, `PLUGIN_ENTRY`, `SKILLS_CONFIG_PATH`, `sourceDirFor`, `destRelFor`, `pointerPathsFor`, and `configFileFor`.
- `cli/src/lib/prereq.ts` is the existing prerequisite pattern: `parseNodeMajor`, `checkNode({ runner, minMajor })`, default `execFileSync`, side-effect-free result object. `runtime-version.ts` should mirror it.
- `cli/src/commands/install.ts` gates on Node, resolves the source, validates providers/models, builds `GenerateOptions`, then calls `initManagedManifest(repo, version, ref, ctx)` at line 133. The version preflight must run before that call.
- `cli/src/lib/config-gen.ts` still emits singular `"agent"`, `"provider"`, `"plugin"`, `"permission"` for both runtimes and imports `PLUGIN_ENTRY` (the ponytail V1 file). Plan A does not change this output.
- `cli/src/lib/config-gen.ts` exports `isLayoutStaleConfig(filePath)` (layout-only: `.opencode/` or missing `"skills"`). `install.ts` calls it at lines 166-167. Plan A adds the runtime-aware function but leaves these call sites alone.
- `cli/tests/helpers/install.ts` has `installOptions`, `sourceDir`, `seedLegacyInstall`, `seedLegacyConfig`, `captureLogs`, `mockExit`, and `expectPointer`. Reuse it.
- `cli/tests/integration/install-layout.test.ts` already spawns the CLI through `node_modules/tsx/dist/cli.mjs` and uses `doInstall` directly. Follow that pattern.
- `cli/package.json` has no `ajv`. There is no `cli/tests/fixtures/` directory yet.
- `cli/eslint.config.mjs` lints only `src/**/*.ts`; `make check-node` runs `cd cli && npx tsc --noEmit`, ESLint, and Prettier over `src/`. Test files under `cli/tests/` are executed by vitest but are not typechecked or linted by the default gate.
- `cli/tsconfig.json` includes only `src/**/*`, so `npm run typecheck` at the root does **not** check CLI tests. Use `make check-node` for `cli/src` and `npx vitest run <path>` for tests.
- ADR numbers: ADR-0046 is the `.agents/` decision, ADR-0047 exists, and ADR-0048 is claimed by open PRs #255 and #274. Plan B uses **ADR-0049**.

### Version gate decisions (locked)

1. `--runtime opencode` targets OpenCode 2.x only. A detected major `< 2` fails before any install mutation, including `--dry-run`.
2. `--runtime kilocode` is never version-gated. It keeps the V1 shape until Kilo Code ships its own V2 runtime/plugin API.
3. Detection reads `WAYFORGE_OPENCODE_VERSION` when set and non-empty; otherwise it runs `opencode --version`. A leading `v` is accepted.
4. Missing, throwing, or unparsable output logs a warning and assumes V2. This is the agreed fail-open behavior; the env override is the deterministic CI/offline escape hatch.
5. The gate is side-effect free: it returns a result and never logs or exits itself. `install.ts` owns logging and `process.exit(1)`.
6. The minimum major comes from the runtime descriptor, not a second hardcoded constant.

### Conditional scope and deferrals

- **#274 (issue #239):** if it merges before Plan A is implemented, the shipped plugin set becomes four. Add `wayforge-update` to both plugin-entry lists in `RUNTIME_SHAPES` and extend the descriptor tests. Do not add its V2 entrypoint in Plan A; Plan B owns that. If it has not merged, keep three plugins.
- **#255 (issue #231):** deferred. It does not block Plan A. It must rebase after Plan A/Plan B and adapt its agent-set, permission-fixture, and plan-format changes. Do not wait for it and do not adopt its plan format here.
- **#253/#254:** merged on `develop` (`8589948`, `ce40dbf`). The `.agents/` layout and vitest helper are prerequisites already satisfied.

## Out of scope for Plan A

- Changing generated config keys, plugin entries, permission rendering, or agent frontmatter. Those are Plan B. The Task 1 `schemaUrlFor` swap is a source-level deduplication only; emitted config bytes must stay identical.
- Wiring `isRuntimeConfigStale` into `install.ts` / update. See Task 5 for why.
- Adding V2 plugin entrypoints or package `exports`. Plan B.
- ADR-0049, architecture, compatibility matrix, README, and changelog. Plan B. The only Plan A memory write is the closure log entry in completion criterion 8.
- Migrating consuming repositories' committed configs in place.
- Supporting OpenCode 1.x under `--runtime opencode`.
- Reopening the `.kilo/**` routing work or the legacy release installers.

## Tasks

### Task 1: Declare runtime shapes in `layout.ts` and cover the descriptor

**Objective:** Make `layout.ts` the single declaration of runtime-specific config shape data, with no duplicate config-file table.

**Files:**
- Modify: `cli/src/lib/layout.ts`
- Modify: `cli/src/lib/config-gen.ts:194-197` (schema URL ternary only)
- Create: `cli/tests/unit/layout-shapes.test.ts`
- Validate: `npx vitest run cli/tests/unit/layout-shapes.test.ts cli/tests/unit/config-gen.test.ts`

**Step 1: Establish expected behaviour**

Add the descriptor with these values:

| Field | `opencode` | `kilocode` |
|---|---|---|
| `configFile` | `opencode.jsonc` | `kilo.jsonc` |
| `schemaUrl` | `https://opencode.ai/config.json` | `https://app.kilo.ai/config.json` |
| `keys.agents` | `agents` | `agent` |
| `keys.providers` | `providers` | `provider` |
| `keys.plugins` | `plugins` | `plugin` |
| `keys.permissions` | `permissions` | `permission` |
| `pluginEntries` | `./.agents/plugins/ponytail`, `./.agents/plugins/session-tracker`, `./.agents/plugins/token-counter` (directories) | `./.agents/plugins/ponytail/ponytail.mjs`, `./.agents/plugins/session-tracker/index.js`, `./.agents/plugins/token-counter/index.js` (files) |
| `minimumOpenCodeMajor` | `2` | `undefined` |

Invariants:

- `configFileFor(runtime)` returns the descriptor value.
- `RUNTIMES` is derived from `RUNTIME_SHAPES`, not from a second table.
- `schemaUrlFor(runtime)` and `pluginEntriesFor(runtime)` are the public accessors.
- `pluginEntriesFor('opencode')` entries are directories (no file extension).
- `pluginEntriesFor('kilocode')` entries are files.
- Every entry uses POSIX separators and the `.agents` root; none contains `.opencode/`.
- `PLUGIN_ENTRY` still exists for `config-gen.ts` and equals the ponytail V1 file entry (`./.agents/plugins/ponytail/ponytail.mjs`), which remains present in `pluginEntriesFor('kilocode')` even if #274 adds a fourth plugin.
- `RUNTIME_POINTER_DIRS` is unchanged and remains the pointer source of truth.
- Plan A does **not** change `generateOpenCodeJsonc` output. After Task 1, `generateOpenCodeJsonc` reads the schema URL from `schemaUrlFor(opts.runtime)` instead of a literal ternary; the emitted bytes are identical for both runtimes. Everything else in config generation remains data for Plan B.

**Step 2: Add or update validation**

Create `cli/tests/unit/layout-shapes.test.ts`:

- `describe.each(RUNTIMES)` asserts every field in the table.
- Assert `RUNTIMES` contains exactly `opencode` and `kilocode`.
- Assert `configFileFor(runtime)` equals `RUNTIME_SHAPES[runtime].configFile`.
- Assert `schemaUrlFor(runtime)` equals the table.
- Assert `pluginEntriesFor(runtime)` deep-equals the table and every entry starts with `./.agents/plugins/`.
- Assert the opencode entries have no `.mjs`/`.js` suffix and the kilocode entries end in a file name.
- Assert `PLUGIN_ENTRY` equals `./.agents/plugins/ponytail/ponytail.mjs` and is included in `pluginEntriesFor('kilocode')`.
- Assert `RUNTIME_SHAPES.kilocode.minimumOpenCodeMajor` is `undefined` and opencode is `2`.
- Assert `pluginEntriesFor` returns a fresh array or a read-only copy so callers cannot mutate the descriptor (use `Object.freeze` or return a copy; test that mutation does not leak).
- If #274 has merged, assert both lists contain the `wayforge-update` entry and the expected count is four.

Validation owner: `agent`.

**Step 3: Write minimal implementation**

In `cli/src/lib/layout.ts`:

- Add `export interface RuntimeShape` with `configFile`, `schemaUrl`, `keys: Record<'agents' | 'providers' | 'plugins' | 'permissions', string>`, `pluginEntries: readonly string[]`, and `minimumOpenCodeMajor?: number`.
- Add `export const RUNTIME_SHAPES: Record<Runtime, RuntimeShape>`.
- Replace the private `CONFIG_FILES` table with `RUNTIME_SHAPES`; make `RUNTIMES = Object.keys(RUNTIME_SHAPES) as Runtime[]`.
- Add `schemaUrlFor(runtime)` and `pluginEntriesFor(runtime)`.
- Keep `PLUGIN_ENTRY` as the ponytail V1 file entry. Derive it from the kilocode descriptor by lookup (not by array index) or keep the literal and pin it with a test, so there is one source of truth and #274 can append without reordering.
- In `cli/src/lib/config-gen.ts`, replace the literal runtime ternary at lines 194-197 with `schemaUrlFor(opts.runtime)`. Make no other change; output must be byte-identical for both runtimes.
- Do not modify `install.ts`, `permissions.ts`, or any plugin package in this task.

**Step 4: Run test to verify pass**

Run: `npx vitest run cli/tests/unit/layout-shapes.test.ts cli/tests/unit/config-gen.test.ts`
Run: `make check-node`
Expected: descriptor tests pass; existing config-generation tests stay green with byte-identical output; `cli/src` typecheck, ESLint, and Prettier are clean.

**Step 5: Commit**

`git add cli/src/lib/layout.ts cli/src/lib/config-gen.ts cli/tests/unit/layout-shapes.test.ts`
`git commit -m "feat(cli): declare runtime shape descriptors"`

---

### Task 2: Add the OpenCode version parser, detector, and assertion

**Objective:** Provide a side-effect-free module that parses an OpenCode major, detects the installed version through an injectable runner, and reports whether the selected runtime is supported.

**Files:**
- Create: `cli/src/lib/runtime-version.ts`
- Create: `cli/tests/unit/runtime-version.test.ts`
- Validate: `npx vitest run cli/tests/unit/runtime-version.test.ts`

**Step 1: Establish expected behaviour**

`parseRuntimeMajor(version)`:

- `'2.2.5'` -> `2`
- `'v2.2.5'` -> `2`
- `'  1.19.5\n'` -> `1`
- `'not-a-version'`, `''`, `'opencode 1.19.5'` -> `undefined` (strict leading-version form, matching `parseNodeMajor`).

`detectOpenCodeVersion({ env?, runner? })`:

- A non-empty `WAYFORGE_OPENCODE_VERSION` wins over the binary. Trim it. Source is `'env'`.
- An empty or whitespace-only env value is treated as unset and falls through to the runner.
- Otherwise call the runner with `('opencode', ['--version'])`. Source is `'binary'`.
- A throwing runner or output with no parseable major returns `{ version: <raw>, source, warning }` and the warning says the version could not be determined and OpenCode 2.x is assumed.
- A parseable version returns `{ version, source }` with no warning.
- `source` is `'env'` when the override supplied the value, `'binary'` when the runner was attempted (even if it threw or returned unparsable output), and `'assumed'` only when no detection ran.
- The default runner is `execFileSync('opencode', ['--version'], { shell: true })` on **every** platform. The command and args are fixed literals, so no user input reaches the shell, and there is no `process.platform` branch. This preserves ADR-0031 Decision 5 (no `win32` hardcoding; platform variance via runtime detection) while still resolving the npm `opencode.cmd` shim on Windows through one uniform code path. Construct the default runner inside `detectOpenCodeVersion` so tests can mock `child_process`.

`assertRuntimeSupported(runtime, opts?)`:

| Input | Result |
|---|---|
| `opencode` + env `2.2.5` | `ok: true`, `source: 'env'` |
| `opencode` + env `v2.2.5` | `ok: true`, major 2 |
| `opencode` + env `1.19.5` | `ok: false`, message contains `OpenCode 2.x is required`, `@opencode/cli`, `1.19.5`, `WAYFORGE_OPENCODE_VERSION` |
| `opencode`, no env, runner `2.2.5` | `ok: true`, `source: 'binary'` |
| `opencode`, no env, runner `1.19.5` | `ok: false` with the same message fragments |
| `opencode`, no env, runner throws | `ok: true` + warning containing `could not determine` and `assuming OpenCode 2.x` |
| `opencode`, no env, runner returns `''` / garbage | `ok: true` + the same warning |
| `opencode`, env empty, runner `2.2.5` | falls through; `ok: true`, `source: 'binary'` |
| `kilocode` + any env/runner | `ok: true`, `source: 'assumed'`, no runner call |
| `kilocode` + env `1.19.5` | `ok: true`, no failure |

The minimum major is read from `RUNTIME_SHAPES[runtime].minimumOpenCodeMajor`. If it is `undefined`, return `ok: true` without detection. Do not hardcode `2` in the assertion module.

**Step 2: Add or update validation**

Create `cli/tests/unit/runtime-version.test.ts` and cover every row above. Inject both `env` and `runner`; never spawn a real `opencode` binary and never depend on the host's installed version. Assert exact failure-text fragments and the warning fragments. Add a case where the runner is a spy and assert it is not called for `kilocode`. Add one `vi.mock('child_process')` case: with no injected runner and no env override, `detectOpenCodeVersion()` calls `execFileSync('opencode', ['--version'], { shell: true })`; construct the default runner inside `detectOpenCodeVersion` (not at module scope) so the mock applies. Validation owner: `agent`.

**Step 3: Write minimal implementation**

Create `cli/src/lib/runtime-version.ts` with:

```ts
export type VersionSource = 'env' | 'binary' | 'assumed'

export interface RuntimeSupportOk {
  ok: true
  version?: string
  source: VersionSource
  warning?: string
}

export interface RuntimeSupportFailure {
  ok: false
  version?: string
  source: VersionSource
  message: string
}

export type RuntimeSupport = RuntimeSupportOk | RuntimeSupportFailure

export function parseRuntimeMajor(version: string): number | undefined
export function detectOpenCodeVersion(opts?: {
  env?: NodeJS.ProcessEnv
  runner?: (cmd: string, args: string[]) => string
}): { version?: string; source: VersionSource; warning?: string }
export function assertRuntimeSupported(
  runtime: Runtime,
  opts?: { env?: NodeJS.ProcessEnv; runner?: (cmd: string, args: string[]) => string },
): RuntimeSupport
```

Use `execFileSync` with the same runner shape as `prereq.ts`. Keep the module free of `console.log`, `process.exit`, and filesystem writes. Do not import `install.ts`.

**Step 4: Run test to verify pass**

Run: `npx vitest run cli/tests/unit/runtime-version.test.ts`
Run: `make check-node`
Expected: all parser/detector/assertion cases pass; `cli/src` typecheck, ESLint, and Prettier are clean.

**Step 5: Commit**

`git add cli/src/lib/runtime-version.ts cli/tests/unit/runtime-version.test.ts`
`git commit -m "feat(cli): add OpenCode version preflight"`

---

### Task 3: Wire the preflight into install and update CLI help

**Objective:** Reject an unsupported OpenCode major before any target-repository mutation, including under `--dry-run`, while leaving `--runtime kilocode` ungated.

**Files:**
- Modify: `cli/src/commands/install.ts`
- Modify: `cli/src/index.ts`
- Create: `cli/tests/integration/install-preflight.test.ts`
- Validate: `npx vitest run cli/tests/integration/install-preflight.test.ts`

**Step 1: Establish expected behaviour**

- The gate runs in `doInstall` after `validateModelOverride` calls and before `initManagedManifest`.
- A failure logs the returned message and calls `process.exit(1)` in both real and dry-run installs. This intentionally differs from the Node check, which continues on dry-run: a dry-run must not report a plan that a real install would reject.
- A warning is logged and the install continues.
- A supported version proceeds with no extra output.
- `--runtime kilocode` never calls detection and never fails because of the OpenCode version.
- The gate also runs for interactive installs because `cli/src/commands/interactive.ts:247` delegates to `doInstall`. No separate call site is added in this task.
- On failure, the target repo receives no `.wayforge-managed`, no `.agents/**`, no pointers, and no generated config. `resolveSourceDir` and `cloneRef` may run before the gate, but they do not mutate the target repo.
- CLI help says `opencode` means OpenCode 2.x and `kilocode` means Kilo Code 1.x-compatible.

**Step 2: Add or update validation**

Create `cli/tests/integration/install-preflight.test.ts` using `cli/tests/helpers/install.ts`:

- `beforeEach` creates a temp repo and stubs `WAYFORGE_HOME` to `sourceDir`; `afterEach` restores mocks/env and removes the temp tree.
- `WAYFORGE_OPENCODE_VERSION=1.19.5` + `dryRun: true` -> `await expect(doInstall(...)).rejects.toThrow('process.exit:1')`; logs contain `OpenCode 2.x is required`, `@opencode/cli`, `1.19.5`, `WAYFORGE_OPENCODE_VERSION`; the repo has no `.wayforge-managed`, `.agents`, `.opencode`, `opencode.jsonc`, or `AGENTS.md`.
- `WAYFORGE_OPENCODE_VERSION=1.19.5` + `dryRun: false` -> same failure and the repo is still empty.
- `WAYFORGE_OPENCODE_VERSION=2.2.5` + `dryRun: true` -> does not throw and writes nothing.
- `WAYFORGE_OPENCODE_VERSION=1.19.5` + `runtime: 'kilocode'` -> install succeeds and writes `kilo.jsonc`; no OpenCode failure log.
- Spawn `process.execPath` with `path.join(sourceDir, 'node_modules', 'tsx', 'dist', 'cli.mjs')`, `cli/src/index.ts`, `install`, `--help` and assert exit 0 plus the new runtime description fragments.

Use `mockExit` from the helper so `process.exit` throws instead of terminating vitest. No separate interactive test is required: the `doInstall` cases above exercise the shared path. Keep `interactive.ts` out of this task's Files and commit. Validation owner: `agent`.

**Step 3: Write minimal implementation**

In `cli/src/commands/install.ts`:

- Import `assertRuntimeSupported` from `../lib/runtime-version.js`.
- After the three `validateModelOverride` calls and before `initManagedManifest`, call `assertRuntimeSupported(options.runtime)`.
- If `!support.ok`, `ctx.log(support.message)` and `process.exit(1)`.
- Else if `support.warning`, `ctx.log(support.warning)`.
- Do not change the Node gate, provider validation, or any sync path.

In `cli/src/index.ts`, update the `--runtime <name>` description to name both supported shapes, for example: `'Runtime to configure: opencode (OpenCode 2.x) or kilocode (Kilo Code 1.x-compatible).'`

**Step 4: Run test to verify pass**

Run: `npx vitest run cli/tests/integration/install-preflight.test.ts`
Run: `npx tsx cli/src/index.ts install --help` and confirm the runtime description.
Run: `make check-node`
Expected: the negative dry-run and real-run cases exit before mutation; kilocode is unaffected; help text is present; `cli/src` checks are clean.

**Step 5: Commit**

`git add cli/src/commands/install.ts cli/src/index.ts cli/tests/integration/install-preflight.test.ts`
`git commit -m "feat(cli): gate installs on OpenCode 2.x"`

---

### Task 4: Vendor the OpenCode V2 schema and add the offline validation harness

**Objective:** Put a point-in-time V2 schema fixture and a reusable Ajv harness in the test tree so Plan B can validate generated configs without network access.

**Files:**
- Modify: `cli/package.json` (add `ajv` to `devDependencies`)
- Modify: `package-lock.json` (npm workspace lockfile)
- Create: `cli/tests/fixtures/opencode-v2-config.schema.json`
- Create: `cli/tests/fixtures/README.md`
- Create: `cli/tests/helpers/schema.ts`
- Create: `cli/tests/unit/schema-harness.test.ts`
- Validate: `npx vitest run cli/tests/unit/schema-harness.test.ts`

**Step 1: Establish expected behaviour**

- The fixture is a vendored copy of `https://opencode.ai/config.json` fetched on the implementation date and recorded in `cli/tests/fixtures/README.md`.
- The only allowed transform is replacing the external `small_model` `$ref` to `https://models.dev/model-schema.json#/$defs/Model` with `{"type": "string"}` so validation stays offline. No other constraints are dropped. The README records the source URL, fetch date, the exact transform, and the refresh procedure.
- `cli/tests/helpers/schema.ts` exports:
  - `parseGeneratedConfig(content: string): unknown` — strips the first line (the managed header) and `JSON.parse`s the rest.
  - `validateOpenCodeV2Config(value: unknown): string[]` — returns Ajv error text, empty when valid.
  - `expectValidOpenCodeV2Config(value: unknown): void` — throws with joined errors when invalid.
- The harness compiles the fixture once at module load with `Ajv2020` from `ajv/dist/2020`, using `{ allErrors: true, strict: false, validateFormats: false }` so the fixture compiles offline without `ajv-formats`.
- Tests never fetch the network.
- A minimal valid V2 document (for example `{ "$schema": "...", "agents": {}, "providers": {}, "plugins": [], "permissions": [] }`) validates. A document with a wrong type (for example `permissions: "allow"` or `agents: []`) fails.

**Step 2: Add or update validation**

Create `cli/tests/unit/schema-harness.test.ts`:

- `parseGeneratedConfig` strips `// Generated by wayforge bootstrap` and parses a valid JSON body.
- `parseGeneratedConfig` throws on a body that is not JSON after the header.
- `validateOpenCodeV2Config` returns `[]` for the minimal valid V2 sample.
- `validateOpenCodeV2Config` returns a non-empty error list for `{ "permissions": "allow" }`.
- `validateOpenCodeV2Config` returns a non-empty error list for `{ "agents": [] }`.
- The fixture has no `models.dev` reference and has a `$schema` declaration.
- `cli/tests/fixtures/README.md` names the source URL and the transform.

Validation owner: `agent`.

**Step 3: Write minimal implementation**

- Add `ajv` with `npm install --workspace cli --save-dev ajv@^8.17.1` (or the current 8.x). Commit the updated root `package-lock.json`.
- Fetch the live schema once during implementation, apply the single `$ref` substitution, and save it as `cli/tests/fixtures/opencode-v2-config.schema.json`. Do not commit a script that fetches at test time.
- Write `cli/tests/fixtures/README.md` with: source URL, fetch date, byte size, the external `$ref` that was replaced, the replacement value, and the refresh steps (fetch, replace, update date, run the harness test, record drift).
- Write `cli/tests/helpers/schema.ts` as described. Keep the Ajv instance module-scoped so the fixture compiles once.
- Do not change `config-gen.ts` in this task. The harness is unused by production code until Plan B.

**Step 4: Run test to verify pass**

Run: `npx vitest run cli/tests/unit/schema-harness.test.ts`
Expected: the valid sample passes, both invalid samples fail with Ajv errors, the fixture has no external refs, and parsing strips the header.

Run: `make check-node`
Expected: `cli/src` checks remain clean. The new test helper is not typechecked by `make check-node`; vitest is the authoritative check for it.

**Step 5: Commit**

`git add cli/package.json package-lock.json cli/tests/fixtures cli/tests/helpers/schema.ts cli/tests/unit/schema-harness.test.ts`
`git commit -m "test(cli): vendor OpenCode v2 schema and validation harness"`

---

### Task 5: Add runtime-aware stale-config detection (not wired yet)

**Objective:** Implement and test `isRuntimeConfigStale(runtime, file)` so Plan B can regenerate V1-shaped OpenCode configs on upgrade, without changing install behavior in Plan A.

**Files:**
- Modify: `cli/src/lib/config-gen.ts`
- Modify: `cli/tests/unit/config-gen.test.ts`
- Validate: `npx vitest run cli/tests/unit/config-gen.test.ts`

**Step 1: Establish expected behaviour**

`isRuntimeConfigStale(runtime, filePath)`:

- Returns `false` when the file does not exist or is not a wayforge-managed config (the first line is not `MANAGED_OPENCODE_HEADER`). Reuse `isManagedOpenCodeFile`.
- For both runtimes, returns `true` when the content contains `${LEGACY_ARTIFACT_ROOT}/` (`.opencode/`) or lacks the `"skills"` key. These are the existing #253 layout checks.
- For `opencode`, additionally returns `true` when any of `"agents"`, `"providers"`, `"plugins"`, `"permissions"` is missing, or when any of `"agent"`, `"provider"`, `"plugin"`, `"permission"` is present as a key.
- For `kilocode`, returns `false` after the layout checks even if the content has singular keys or lacks native V2 keys.
- Key matching must be exact key tokens, not substrings: `"permissions":` must not be read as `"permission":`, `"agents":` must not be read as `"agent":`, and so on. Use a `new RegExp(\`"${key}"\\s*:\`)` helper or parse the JSON body. Do not use `content.includes('"permission"')`.
- The function is read-only and side-effect free.

**Do not wire this into `install.ts` in Plan A.** `install.ts` still calls `isLayoutStaleConfig`. If the runtime-aware function were wired before Plan B changes config generation, every refresh of an OpenCode config would regenerate the current V1 shape, immediately judge it stale again, and break the existing idempotency guarantee in `cli/tests/integration/install-layout.test.ts`. Plan B Task 6 wires it after V2 emission lands.

**Step 2: Add or update validation**

Extend `cli/tests/unit/config-gen.test.ts`:

- Add a helper that writes a managed config to a temp file with `MANAGED_OPENCODE_HEADER` as the first line.
- Non-managed file -> `false` for both runtimes.
- Managed OpenCode config with `.opencode/` -> `true`.
- Managed OpenCode config without `"skills"` -> `true`.
- Complete V2-shaped OpenCode config (all four native keys, `"skills"`, no singular keys) -> `false`.
- Missing each of `"agents"`, `"providers"`, `"plugins"`, `"permissions"` -> `true` (four cases).
- Present each of `"agent"`, `"provider"`, `"plugin"`, `"permission"` -> `true` (four cases).
- Regression: a config with `"permissions"`, `"plugins"`, `"agents"`, `"providers"` is not flagged by the singular-key checks.
- Managed Kilo V1-shaped config with `"skills"` and no `.opencode/` -> `false`.
- Managed Kilo config with `.opencode/` or without `"skills"` -> `true`.
- Existing `isLayoutStaleConfig` tests/behavior remain unchanged.
- Keep the expected key names literal in the tests (`agents`, `providers`, `plugins`, `permissions` and `agent`, `provider`, `plugin`, `permission`) so the tests pin the V2/V1 contract independently of the descriptor; do not derive test expectations from `RUNTIME_SHAPES`.

Validation owner: `agent`.

**Step 3: Write minimal implementation**

In `cli/src/lib/config-gen.ts`:

- Derive the key sets from `RUNTIME_SHAPES` inside `config-gen.ts`: the required native keys are `Object.values(RUNTIME_SHAPES.opencode.keys)` and the V1 singular keys are `Object.values(RUNTIME_SHAPES.kilocode.keys)`. Do not add hardcoded key literals. Add a comment that the kilocode values are the V1 singular set for as long as Kilo stays V1, and that this derivation must be revisited if Kilo ships V2 (issue #277).
- Add a small exact-key helper.
- Add `export function isRuntimeConfigStale(runtime: Runtime, filePath: string): boolean`.
- Keep `isLayoutStaleConfig` exported and unchanged so existing tests and install behavior stay green.
- Add a short comment above `isRuntimeConfigStale` noting it is wired in Plan B after V2 config generation lands.
- Do not make any further change to `generateOpenCodeJsonc` (Task 1 already swapped its schema-URL source), `syncGeneratedOpenCodeJsonc`, or any `install.ts` call site.

**Step 4: Run test to verify pass**

Run: `npx vitest run cli/tests/unit/config-gen.test.ts`
Run: `make check-node`
Expected: the new stale cases pass, existing config-generation and sync tests remain green, and `cli/src` checks are clean.

**Step 5: Commit**

`git add cli/src/lib/config-gen.ts cli/tests/unit/config-gen.test.ts`
`git commit -m "feat(cli): detect stale OpenCode v2 config shape"`

## Plan A completion criteria

Plan A is complete when all five tasks are merged and:

1. `RUNTIME_SHAPES` is the single source for config filename, schema URL, native key names, plugin entries, and minimum OpenCode major.
2. `assertRuntimeSupported` rejects a detected OpenCode 1.x before `initManagedManifest`, including under `--dry-run`, and never gates kilocode.
3. The CLI help names OpenCode 2.x and Kilo Code 1.x-compatible.
4. The vendored V2 schema fixture and Ajv harness exist and validate a positive sample while rejecting negative samples offline.
5. `isRuntimeConfigStale` is implemented and unit-tested but deliberately unwired.
6. `make check` is green.
7. No generated artifact changed shape in Plan A. Existing install-layout and config-gen tests remain green.
8. Memory gate (`memory_update: true`): at Plan A closure, set this plan's frontmatter to `status: completed` and `task: 5/5`, refresh `updated`, and append one entry to `docs/ai/logs/2026-11.md` (create the file if absent) summarizing the five tasks and any deviations. Do **not** write ADR-0049, `architecture.md`, the compatibility matrix, README, or CHANGELOG in Plan A — those remain Plan B and are recorded there.

## Handoff to Plan B

Before re-planning Plan B, re-verify:

- Merge or rebase `feature/issue-279-opencode-v2-migration` (commit `fd3a586`) first; the Plan B plan document is not on `develop`, so read it from that branch and reconcile it with Plan A as landed.
- The current OpenCode and `@opencode/plugin` versions and re-fetch the schema fixture if upstream drifted.
- Whether PR #274 merged; if so, update both plugin-entry lists and add its V2 entrypoint to Plan B scope.
- Whether PR #255 merged or rebased; if so, reconcile the agent set, permission fixtures, and plan format.
- That Plan A's descriptor exports and `isRuntimeConfigStale` signature match what Plan B Task 1 and Task 6 expect.
- Confirm the seven-task Plan B budget with the user before implementation handoff (6-8 tasks require confirmation under the plan skill).

## Risks and assumptions to verify during implementation

- **Fail-open version detection.** Missing or unparsable `opencode --version` output warns and assumes V2. A broken Windows shim could therefore skip the gate. The default runner passes `{ shell: true }` unconditionally (fixed literals, no platform branch) so the npm `.cmd` shim resolves; CI must set `WAYFORGE_OPENCODE_VERSION` explicitly.
- **Strict version parsing.** `parseRuntimeMajor` only accepts a leading `v?<major>` token, matching `parseNodeMajor`. Output such as `opencode 1.19.5` is treated as unparsable and assumed V2. If the real CLI prints a prefixed string, revisit the parser before Plan B ships.
- **The local workstation runs OpenCode 1.19.5.** Real `--runtime opencode` installs will fail until `@opencode/cli` 2.x is installed or `WAYFORGE_OPENCODE_VERSION=2.x` is set. Tests must inject the env/runner and never depend on the host binary.
- **Schema fixture drift.** The fixture is a point-in-time copy with one documented external-ref substitution. CI validates against the fixture, so a stale fixture can pass while upstream changes. The README refresh procedure mitigates this; Plan B must record the fixture date in the ADR.
- **Descriptor/generation divergence is intentional.** `RUNTIME_SHAPES` lists three plugin entries while `config-gen.ts` still emits only the ponytail V1 entry. This is safe because Plan A does not generate from the descriptor. Plan B Task 1 must switch emission to `pluginEntriesFor` and add the V2 entrypoints before the generated config can reference directories.
- **`isRuntimeConfigStale` is dead code until Plan B.** That is intentional. Do not wire it early; the existing idempotency test would fail if the generated V1 shape were immediately classified stale.
- **`ajv` lockfile update.** The CLI is an npm workspace, so the dependency must be installed with `--workspace cli` and the root `package-lock.json` committed. Do not hand-edit `cli/package.json` without updating the lockfile.
- **Plan A does not satisfy the migration goal by itself.** It is a foundation plan. Issue #226 remains open until Plan B lands and the human runtime checks in Plan B pass.
