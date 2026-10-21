---
status: planned
created: 2026-10-21
issue: 239
parent_issue: 48
depends_on:
  - 237
task: 0/2
required_gates:
  architect_review: false
  memory_update: true
---

# Issue #239 (48c): OpenCode and Kilo Code update notifier

**Goal:** Notify users about newer wayforge releases while they are working in OpenCode or Kilo Code, without requiring them to run the `wfg` CLI first.

**Architecture:** A shared notifier core under `base/opencode/plugins/wayforge-update/` reads the installed version and the shared `update-check.json` cache, refreshes the latest release when needed, and emits a toast through the runtime client. Two thin entrypoints adapt the module shape: OpenCode uses a named `server` export; Kilo Code uses the default `{ id, server }` descriptor. The installer registers the correct entrypoint per runtime. This issue depends on #237 for the cache schema and version comparison; it does not touch managed projects or #229.

**Tech Stack:** JavaScript ESM plugins, OpenCode `@opencode-ai/plugin` server hooks, Kilo Code `@kilocode/plugin` server hooks, Vitest for shared-core tests.

**Scope classification:** `multi-task`

**Task count:** 2

## Verified facts

- OpenCode server plugins use named hooks and support `event` plus `experimental.chat.system.transform` (`base/opencode/plugins/ponytail/ponytail.mjs`, `base/opencode/plugins/session-tracker/index.js`).
- The OpenCode plugin context exposes `client`; server-side plugins can publish a toast with `client.tui.showToast(...)` (OpenCode SDK `tui.toast.show`).
- OpenCode session events include `session.created`, `session.idle`, and `session.updated` (OpenCode plugin docs; `session-tracker` handles message events).
- Kilo Code has a server plugin API with the default `{ id, server }` module shape and `event` hook (`kilo.ai/docs/automate/extending/plugins`).
- The Kilo Code plugin context exposes `client: KiloClient`; `@kilocode/sdk` exposes `client.tui.showToast(...)` (`KiloClient.tui.showToast`).
- Kilo Code plugins can be loaded from the project `plugin` array or from `.kilo/plugin/`; wayforge already registers plugins explicitly in generated `kilo.jsonc`.
- `cli/src/lib/config-gen.ts:199-210` currently hardcodes the `"plugin"` array to the ponytail plugin. It must register the notifier entrypoint conditionally by runtime.
- Plugin files under `base/opencode/plugins/**` are synced by the installer's managed tree; no new install root is required.
- `WAYFORGE_INSTALL_DIR` and the default prefix (`~/.wayforge` / `%LOCALAPPDATA%\wayforge`) locate `share/wayforge/VERSION`.
- The shared update cache from #237 lives at `<stateDir>/update-check.json`.

## Tasks

### Task 1: Add the shared notifier core and runtime entrypoints

**Objective:** Both runtimes can load a plugin that checks the update cache and shows a toast when a newer release exists, using the same version/cache logic.

**Files:**
- Create: `base/opencode/plugins/wayforge-update/core.js`
- Create: `base/opencode/plugins/wayforge-update/index.js` (OpenCode)
- Create: `base/opencode/plugins/wayforge-update/kilo.js` (Kilo Code)
- Create: `base/opencode/plugins/wayforge-update/package.json`
- Modify: `cli/src/lib/config-gen.ts`
- Validate: `cli/tests/unit/opencode-update-plugin.test.ts`

**Step 1: Establish expected behaviour**

- On `session.created` (or the first eligible event), the plugin:
  - reads the installed version from `WAYFORGE_INSTALL_DIR` or the default prefix;
  - reads `<stateDir>/update-check.json`;
  - refreshes the latest release if the cache is older than 24 hours and network is available;
  - compares versions and, if newer, calls the runtime toast:
    - OpenCode: `input.client.tui.showToast(...)`;
    - Kilo Code: `ctx.client.tui.showToast(...)`.
- Toast text:

  ```text
  wayforge v1.2.3 disponible (instalada v1.0.2).
  Ejecuta `wfg self-update` para actualizar.
  ```

- Store `notifiedVersion` so the toast is shown once per version.
- Respect `WAYFORGE_NO_UPDATE_CHECK=1`.
- Never block the session; network/toast errors are silent.
- Degrade to a no-op if `client.tui.showToast` is unavailable.
- Do not run self-update, modify projects, or execute remote code.
- `config-gen.ts` registers:
  - `./.opencode/plugins/wayforge-update/index.js` for `opencode`;
  - `./.opencode/plugins/wayforge-update/kilo.js` for `kilocode`.

**Step 2: Add validation**

`cli/tests/unit/opencode-update-plugin.test.ts` with mocked clients:

- cache fresh and latest equal -> no toast;
- cache fresh and latest newer -> one toast;
- cache stale -> refresh called;
- `WAYFORGE_NO_UPDATE_CHECK=1` -> no check/no toast;
- missing installed version/prefix -> no toast;
- toast throws -> no exception escapes;
- `notifiedVersion` suppresses repeat toasts;
- OpenCode and Kilo entrypoints call their respective `client.tui.showToast`;
- config-gen includes the correct plugin path per runtime and not the other runtime's entrypoint.

**Step 3: Write minimal implementation**

- `core.js`: `createNotifier({ client, directory })` with `checkAndNotify`, `readInstalledVersion`, `readCache`, `writeCache`, `resolveLatestVersion`, `buildToastMessage`.
- `index.js`: OpenCode `export async function server(input)` with `event` hook.
- `kilo.js`: `export default { id: 'wayforge-update', server }` with `event` hook.
- `package.json`: `{ "type": "module" }`.
- `config-gen.ts`: build the plugin array by runtime; keep the existing ponytail entry.
- Use `fetch` for the latest release redirect and the same cache schema as #237. Best-effort writes.

**Step 4: Run test to verify pass**

```powershell
npx vitest run cli/tests/unit/opencode-update-plugin.test.ts
cd cli; npx tsc --noEmit
```

Expected: tests pass, typecheck clean. The plugin modules load without importing runtime-specific packages at module scope.

**Step 5: Commit**

```sh
git add base/opencode/plugins/wayforge-update cli/src/lib/config-gen.ts cli/tests/unit/opencode-update-plugin.test.ts
git commit -m "feat(plugins): add OpenCode and Kilo Code update notifier (Issue #239)"
```

### Task 2: Document the notifier and validate both runtimes

**Objective:** Users understand the in-editor notice, how to disable it, and the runtime limitations; the plugin is validated in OpenCode and Kilo Code.

**Files:**
- Modify: `README.md`, `docs/ai/architecture.md`, `RELEASE.md`
- Create: `docs/ai/decisions/ADR-0048-runtime-update-notifier.md`
- Modify: `docs/ai/logs/2026-10.md`
- Validate: OpenCode and Kilo Code manual runs

**Step 1: Establish expected behaviour**

- README: the CLI notice, the OpenCode/Kilo Code toast, `WAYFORGE_NO_UPDATE_CHECK=1`, and the fact that the toast only informs.
- Architecture: plugin entrypoints, cache reuse, conditional registration, runtime difference, graceful fallback.
- ADR-0048: decision to use server plugins + `client.tui.showToast`, not TUI dialogs or auto-update; Kilo Code module-shape difference; compatibility/fallback.
- Release notes: plugins are installed/synced with the normal project install.

**Step 2: Add validation**

- Agent: `make check`; plugin unit tests; config-gen test.
- Human: OpenCode session with a newer cached release -> toast appears once; Kilo Code CLI session -> toast appears; Kilo Code VS Code extension -> toast appears (if the extension uses the same server plugin host).
- Human: `WAYFORGE_NO_UPDATE_CHECK=1` suppresses both.
- Human: a runtime version without `client.tui.showToast` does not break the session.

**Step 3: Write minimal implementation**

- Documentation and ADR-0048.
- Log entry with tests and manual validation results.

**Step 4: Run test to verify pass**

```powershell
make check
```

Expected: green. Human checks above pass; if a runtime cannot show the toast, document the gap instead of claiming support.

**Step 5: Commit**

```sh
git add README.md docs/ai/architecture.md RELEASE.md docs/ai/decisions/ADR-0048-runtime-update-notifier.md docs/ai/logs/2026-10.md
git commit -m "docs: document OpenCode and Kilo Code update notifier (Issue #239)"
```

## Validation ownership

| Validation | Owner |
|---|---|
| Shared notifier core tests with mocked clients | agent |
| OpenCode/Kilo entrypoint tests | agent |
| Config-gen registration test | agent |
| `make check` | agent |
| OpenCode toast on session creation | human |
| Kilo Code CLI toast | human |
| Kilo Code VS Code extension toast | human |
| Opt-out and missing-toast fallback | human |

## Acceptance criteria

- [ ] The shared notifier reads the installed version and shared cache, checks the latest release at most once per 24 hours, and returns a clear update decision.
- [ ] OpenCode loads the plugin via `opencode.jsonc` and shows a toast on session creation when a newer release exists.
- [ ] Kilo Code loads the plugin via `kilo.jsonc` and shows the same toast through `KiloClient.tui.showToast`.
- [ ] The correct entrypoint is registered per runtime; the other runtime's entrypoint is not loaded.
- [ ] The toast is shown once per version and respects `WAYFORGE_NO_UPDATE_CHECK=1`.
- [ ] Network/toast failures never break the session; missing toast support degrades to a no-op.
- [ ] The plugin does not update wayforge or managed projects.
- [ ] Tests cover the shared core with mocked OpenCode and Kilo clients.
- [ ] Manual validation passes in OpenCode and both Kilo Code surfaces (CLI and VS Code extension), or gaps are documented.
- [ ] `make check` is green.

## Out of scope

- CLI self-update mechanics and release checksums (#237).
- Managed-project status/update/hooks (#238).
- Automatic update from inside the editor.
- TUI dialogs or route-based UI.
- Kilo Code's own auto-update setting.

## Risks

| Risk | Mitigation |
|---|---|
| OpenCode/Kilo plugin API changes | Wrap hook/client calls in try/catch; no-op on missing toast; validate against installed versions. |
| OpenCode and Kilo module shapes differ | Separate thin entrypoints sharing `core.js`; never load the OpenCode file in Kilo. |
| Plugin runs in every project and nags | Cache `notifiedVersion`; one toast per version; opt-out env. |
| Network check slows session creation | Use the shared 24h cache, 5s timeout, async event handler; never block. |
| Kilo Code VS Code extension plugin support differs from CLI | Validate both; document any gap. |
| Plugin not installed in existing projects | Document that the plugin arrives with the next project install/update. |
