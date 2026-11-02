---
status: completed
created: 2026-11-02
issue: 239
parent_issue: 48
supersedes: docs/ai/plans/2026-10-21_113442-issue-239-runtime-update-notifier.md
task: 2/2
required_gates:
  architect_review: true
  memory_update: true
---

# Issue #239: Opt-in OpenCode and Kilo Code update notifier

**Goal:** Implement the wayforge update-notifier plugin for OpenCode and Kilo Code, with an opt-in runtime gate reused from `WAYFORGE_NO_UPDATE_CHECK`, and document/validate it.

**Architecture:** Add `base/plugins/wayforge-update/**` with one shared notifier core and two thin runtime entrypoints. The core reads the installed CLI version and a plugin-owned 24-hour cache, checks the latest GitHub release only when the runtime gate enables it, and calls `client.tui.showToast(...)` once per version. Installer plugin selection is a separate follow-up in #273 and is not part of this plan.

**Tech Stack:** Plain ESM JavaScript plugins (Node built-ins + global `fetch`), OpenCode plugin hooks (`export async function server`), Kilo Code plugin descriptor (`export default { id, server }`), Vitest.

**Scope classification:** `multi-task`

**Task count:** 2

## Scope note

This plan covers **only issue #239**: the notifier plugin and its documentation/validation. The install-time plugin catalog and `--plugins` selection are tracked separately in **#273** and must not be implemented here. Until #273 lands, manual registration in the generated runtime config is the documented interim activation path.

## Verified facts

- The existing #239 plan is stale: it was written against v1.0.2 on `feature/issue-239-runtime-update-notifier` and references `base/opencode/plugins/**`, `wfg self-update`, and a shared `update-check.json` cache. It is superseded by this plan.
- #237's revision removed the automatic notice, the 24-hour cache, `update-check.json`, `WAYFORGE_NO_UPDATE_CHECK`, and cache-related `WAYFORGE_STATE_DIR` (`docs/ai/decisions/ADR-0047-cli-release-detection-and-self-update.md:35`, `docs/ai/architecture.md:36`). There is no shared cache for #239 to reuse.
- The current update commands are `wfg update` (check only) and `wfg upgrade` (verified install). `wfg self-update` no longer exists (`cli/src/index.ts:100-116`).
- Installed content categories include `plugins` (`cli/src/lib/layout.ts:11-16`). `doInstall` syncs the entire `base/plugins/**` tree into `.agents/plugins/**` (`cli/src/commands/install.ts:277-284`), so adding a plugin directory makes its files available without installer changes.
- Only ponytail is registered in generated config today: `PLUGIN_ENTRY` is a single string and `config-gen.ts` emits a one-element `plugin` array (`cli/src/lib/layout.ts:67-68`, `cli/src/lib/config-gen.ts:226`). `session-tracker` and `token-counter` are installed but unregistered; ADR-0018 records this gap (`docs/ai/decisions/ADR-0018-ts-plugin-migration-analysis.md:108`).
- `InstallOptions` has no plugin selection field (`cli/src/types.ts`), and the interactive installer has no plugin prompt (`cli/src/commands/interactive.ts`). That selection surface belongs to #273.
- OpenCode plugin hooks receive `{ client, directory, ... }` and support `event` with `session.created`; the SDK exposes `client.tui.showToast({ body: { message, variant } })` (OpenCode Plugins and SDK docs, verified 2026-11-02).
- Kilo Code server plugins default-export `{ id, server }`; the plugin context exposes `client` and the same `event` hooks. Kilo docs state its behavior is identical to OpenCode for these APIs (Kilo Plugins docs, verified 2026-11-02).
- Existing plugins use `export async function server(input)` (`base/plugins/ponytail/ponytail.mjs`, `base/plugins/session-tracker/index.js`), which is the OpenCode shape already proven in this repo.
- Installed version precedence is `WAYFORGE_VERSION`, then `resolveSourceDir()/VERSION`; the installed source dir is `<prefix>/share/wayforge` (`cli/src/lib/version.ts`, `cli/src/lib/source-dir.ts:4-19`).
- `resolveInstallPrefix()` honours `WAYFORGE_INSTALL_DIR` and otherwise uses the running binary location (`cli/src/lib/install.ts:17-27`). The plugin runs inside OpenCode/Kilo, not `wfg`, so it must resolve the prefix independently.
- Plugin package metadata exists in `base/plugins/<id>/package.json`; `ponytail` declares `main: ponytail.mjs`, while `session-tracker` and `token-counter` declare `main: index.js` and OpenCode-only peer dependencies.
- There is no existing flag in the current source that enables automatic download/fetch. `WAYFORGE_NO_UPDATE_CHECK` exists only in historical #237 documentation and was removed from the CLI. Reusing it for the plugin is a deliberate new decision.
- Vitest includes `cli/tests/**/*.test.ts` (`vitest.config.ts`); there are currently no plugin-behavior tests.

## Resolved decisions

These are binding for implementation.

1. **Scope is only #239.** This plan implements the notifier plugin and its documentation/validation. Installer plugin selection (`--plugins`, interactive prompt, config-gen arrays, manifest behavior) is #273 and is out of scope.
2. **Reuse `WAYFORGE_NO_UPDATE_CHECK` as the runtime gate, with default-off semantics.** The update check is disabled by default:
   - unset, empty, `1`, `true`, or any other value -> disabled;
   - only an explicit `0` or `false` (case-insensitive) -> enabled.
   This deliberately reinterprets the previously withdrawn opt-out flag as a default-off enable switch. It must be documented clearly in README and ADR-0049 and covered by tests.
3. **Interim activation.** Because the installer still registers only ponytail, the plugin is installed as a file but not active. Until #273 lands, manual registration of `./.agents/plugins/wayforge-update/index.js` (opencode) or `./.agents/plugins/wayforge-update/kilo.js` (kilocode) in the generated config is the documented interim path.
4. **The notifier owns its cache.** The shared `update-check.json` cache no longer exists (ADR-0047). The plugin writes `<user cache>/wayforge/update-notifier.json` with its own numeric schema and never reads or writes CLI state. A `WAYFORGE_NOTIFIER_CACHE` absolute-path override exists only as a test/manual-validation seam.
5. **The toast points at the current command.** The message says ``Run `wfg upgrade` to update.`` The issue's `wfg self-update` text is obsolete.
6. **Toast text is English.** The repository's user-facing docs and CLI output are English; the Spanish example in the issue is illustrative, not binding.
7. **No runtime package imports.** The notifier files import only Node built-ins and use global `fetch` so OpenCode and Kilo Code can load them without resolving `@opencode-ai/plugin` or `@kilocode/plugin`.
8. **Cache miss/failure behavior never blocks the session.** Network, filesystem, and toast errors are swallowed. A missing toast API is a no-op. A failed cache write falls back to in-process state so a single runtime session does not toast repeatedly.

## Blocking decisions and required gates

### Required: architect review before Task 1 implementation

The `architect` gate must review and either accept or amend:

- **Flag semantics:** reusing `WAYFORGE_NO_UPDATE_CHECK` with default-off semantics (only `0`/`false` enables) after ADR-0047 withdrew the flag from the CLI. Confirm this is documented as a plugin-only decision and does not silently resurrect CLI behavior.
- **Interim activation:** accepting manual config registration until #273 lands, with dual gating (registered plugin + `WAYFORGE_NO_UPDATE_CHECK=0|false`).
- **Cache placement:** a plugin-owned user cache after ADR-0047 explicitly withdrew the shared cache/latency budget and `WAYFORGE_STATE_DIR`.
- **Network/trust boundary:** the plugin performs an outbound `fetch` to `WAYFORGE_RELEASE_ROOT`/GitHub from inside a runtime session only when enabled, with a 5-second timeout and no install mutation.
- **Cross-runtime API compatibility:** OpenCode `client.tui.showToast({ body: {...} })`, Kilo `{ id, server }`, named `server` export for OpenCode, and graceful no-op when the method is absent.

If the architect rejects the flag semantics or the plugin cache, amend Task 1 and ADR-0049 before implementation.

### Required: owner decision recorded

The 2026-11-02 owner answers chose plugin-first, installer selection later (#273), and reuse of `WAYFORGE_NO_UPDATE_CHECK` with default-off behavior. Issue #239's body was updated on 2026-11-02 to match this plan; the shared-cache and `wfg self-update` assumptions were removed.

### Required: human validation

OpenCode and both Kilo Code surfaces (CLI and VS Code extension) must be validated manually; unit tests can only mock the clients.

## Tasks

### Task 1: Add the notifier core, runtime gate, and OpenCode/Kilo entrypoints

**Objective:** Both runtimes can load a notifier that is disabled by default, reads the installed version and plugin-owned cache when enabled, checks the latest release at most once per 24 hours, and shows a one-time toast without mutating anything.

**Files:**
- Create: `base/plugins/wayforge-update/core.js`
- Create: `base/plugins/wayforge-update/index.js`
- Create: `base/plugins/wayforge-update/kilo.js`
- Create: `base/plugins/wayforge-update/package.json`
- Create: `cli/tests/unit/wayforge-update-plugin.test.ts`

**Step 1: Establish expected behaviour**

- `createNotifier({ client, env, cachePath, installPrefix, fetchImpl, now, readFile, writeFile })` returns `{ checkAndNotify }`.
- Prefix resolution: `env.WAYFORGE_INSTALL_DIR` when set; otherwise `%LOCALAPPDATA%\wayforge` on Windows and `~/.wayforge` otherwise. `WAYFORGE_VERSION` overrides the installed version for tests, mirroring the CLI.
- Installed version: `WAYFORGE_VERSION`, else `<prefix>/share/wayforge/VERSION`; missing or unparseable -> no-op.
- Cache path: `env.WAYFORGE_NOTIFIER_CACHE` when set; otherwise `<user cache>/wayforge/update-notifier.json` (`%LOCALAPPDATA%\wayforge\update-notifier.json` on Windows, `${XDG_CACHE_HOME:-~/.cache}/wayforge/update-notifier.json` on Unix).
- Cache schema: `{ schemaVersion: 1, lastChecked: string, latestVersion: string | null, notifiedVersion: string | null }`. Mismatched schema or corrupt JSON is discarded.
- Runtime gate: the update check is **disabled by default**. `isUpdateCheckEnabled(env)` returns true only when `WAYFORGE_NO_UPDATE_CHECK` is exactly `0` or `false` (case-insensitive); unset, empty, `1`, `true`, or any other value returns false. When disabled, no cache read, no network call, and no toast occur.
- Fresh cache (less than 24 hours) performs no network request. Stale cache resolves `${WAYFORGE_RELEASE_ROOT || 'https://github.com/Macacoders/wayforge/releases'}/latest` with `redirect: 'manual'`, a 5-second timeout, and `User-Agent: wayforge/<current>`; the tag is parsed from the redirect `Location`.
- Failed lookups update `lastChecked` best-effort and never throw, so an outage cannot add 5 seconds to every session.
- If `latestVersion` is newer than the installed version and `notifiedVersion !== latestVersion`, call `client.tui.showToast({ body: { message: <message>, variant: 'info' } })`, then persist `notifiedVersion`.
- Toast message:

  ```text
  wayforge v1.2.3 is available (installed v1.0.2). Run `wfg upgrade` to update.
  ```

- Missing `client.tui.showToast`, a throwing toast, an unreachable network, an unreadable version, and unwritable cache paths are all silent no-ops (cache writes fall back to in-process state).
- An in-flight guard prevents concurrent `session.created` events from making parallel checks in the same process.
- `index.js` exports `export async function server(input)` and wires `event` -> `session.created` -> `checkAndNotify`.
- `kilo.js` exports `export default { id: 'wayforge-update', server }` with the same event wiring.
- `package.json` declares `"type": "module"`, `"main": "index.js"`, and `wayforge.entrypoints` for `opencode: index.js` and `kilocode: kilo.js`.
- The plugin is not registered by the installer yet; after installation, manual registration in the generated config is the interim activation path. #273 adds the supported selection surface.
- No runtime package imports; no `wfg` invocation; no install or project mutation; no execution of downloaded code.

**Step 2: Add validation**

`cli/tests/unit/wayforge-update-plugin.test.ts` using temp directories and mocked clients/clocks:

- `WAYFORGE_NO_UPDATE_CHECK` unset/empty/`1`/`true`/other -> no cache read, no fetch, no toast;
- `WAYFORGE_NO_UPDATE_CHECK=0` and `=false` -> check runs;
- equal versions -> no toast;
- newer version -> one toast with the exact message and `variant: 'info'`;
- second call with `notifiedVersion` set -> no repeat toast;
- fresh cache -> no fetch; stale cache -> fetch called once;
- missing `VERSION` -> no-op even when enabled;
- `client.tui.showToast` missing -> no throw;
- toast throws -> no exception escapes;
- fetch failure -> no throw and `lastChecked` is updated;
- corrupt/mismatched cache -> discarded and recomputed;
- in-flight guard prevents duplicate concurrent checks;
- OpenCode entrypoint returns a `server` object with an `event` hook;
- Kilo entrypoint default export has `id` and `server`, and the event hook calls the shared core;
- plugin files contain no imports of `@opencode-ai/plugin` or `@kilocode/plugin`.

**Step 3: Write minimal implementation**

- `core.js`: standalone ESM helpers `parseSemver`, `compareVersions`, `isNewer`, `isUpdateCheckEnabled`, `resolveInstallPrefix`, `resolveInstalledVersion`, `resolveCachePath`, `readCache`, `writeCache`, `resolveLatestVersion`, `buildToastMessage`, `createNotifier`.
- `index.js`: OpenCode `server(input)` adapter; read `input.client`.
- `kilo.js`: Kilo default descriptor; read `ctx.client`.
- `package.json`: ESM metadata plus `wayforge.entrypoints`.
- Keep all files dependency-free except Node built-ins and global `fetch`.

**Step 4: Run test to verify pass**

```powershell
npx vitest run cli/tests/unit/wayforge-update-plugin.test.ts
node --check base/plugins/wayforge-update/core.js
node --check base/plugins/wayforge-update/index.js
node --check base/plugins/wayforge-update/kilo.js
cd cli; npx tsc --noEmit
```

Expected: tests pass, all three files parse, and typecheck is clean. Test runs must not touch the real user cache; every test injects a temp cache path.

**Step 5: Commit**

```sh
git add base/plugins/wayforge-update/core.js base/plugins/wayforge-update/index.js base/plugins/wayforge-update/kilo.js base/plugins/wayforge-update/package.json cli/tests/unit/wayforge-update-plugin.test.ts
git commit -m "feat(plugins): add opt-in update notifier for OpenCode and Kilo Code (Issue #239)"
```

---

### Task 2: Document the opt-in notifier and validate both runtimes

**Objective:** Users understand the runtime gate, the plugin-owned cache, the interim manual registration path, and the fact that the notifier only informs; both runtimes are validated.

**Files:**
- Modify: `README.md` (interim registration, runtime gate, toast, cache)
- Modify: `docs/ai/architecture.md` (notifier entrypoints, plugin-owned cache, interim manual registration)
- Create: `docs/ai/decisions/ADR-0049-runtime-update-notifier.md`
- Modify: `RELEASE.md` (release notes: opt-in plugin, no CLI behavior change)
- Create/append: `docs/ai/logs/2026-11.md`
- Validate: manual OpenCode and Kilo Code runs

**Step 1: Establish expected behaviour**

- The notifier is registered manually until #273 lands:
  - opencode: add `./.agents/plugins/wayforge-update/index.js` to `opencode.jsonc`;
  - kilocode: add `./.agents/plugins/wayforge-update/kilo.js` to `kilo.jsonc`.
- Registration alone is not enough: with `WAYFORGE_NO_UPDATE_CHECK` unset/empty/`1`/`true`, the plugin performs no cache read and no fetch.
- `WAYFORGE_NO_UPDATE_CHECK=0` or `=false` enables the check when the plugin is registered.
- The toast appears once per version, only when a newer version exists, and only in a runtime session (`session.created`).
- The message points at `wfg upgrade`; `wfg self-update` is not mentioned.
- ADR-0049 records: the `WAYFORGE_NO_UPDATE_CHECK` default-off reinterpretation; the plugin-owned cache and why it is not the withdrawn CLI cache; the network/trust boundary and no-mutation guarantee; the OpenCode/Kilo module-shape difference; graceful degradation; the interim manual-registration path; #273 as the follow-up for installer selection.
- The 2026-11 log records the plan, tests, manual results, and any runtime gaps.

**Step 2: Add validation**

Agent-owned:

- `make check` green;
- notifier unit tests from Task 1 remain green.

Human-owned (exact procedure):

1. Install into a temp repo and manually register the notifier entrypoint for the selected runtime.
2. Create a temp prefix (`WAYFORGE_INSTALL_DIR`) with `share/wayforge/VERSION` = `1.0.2`, and a local fake release root whose `/latest` redirects to `/tag/v1.0.3` (or publish a newer patch release). Launch OpenCode with `WAYFORGE_INSTALL_DIR`, `WAYFORGE_RELEASE_ROOT`, `WAYFORGE_NOTIFIER_CACHE`, and `WAYFORGE_NO_UPDATE_CHECK=0` pointing at temp paths.
3. Create a session and confirm the toast appears once with `wayforge v1.0.3 is available (installed v1.0.2). Run `wfg upgrade` to update.`
4. Create a second session and confirm no second toast for the same version.
5. Repeat in the Kilo Code CLI and the Kilo Code VS Code extension.
6. Relaunch with `WAYFORGE_NO_UPDATE_CHECK` unset (or `1`) and confirm no toast and no network call in both runtimes.
7. Confirm an install without the notifier registered never shows a toast even with `WAYFORGE_NO_UPDATE_CHECK=0`.
8. Confirm a runtime build without `client.tui.showToast` does not break the session, and an unreachable release root does not block session creation.
9. If any runtime cannot show the toast, document the gap in README/architecture instead of claiming support.

**Step 3: Write minimal implementation**

- README: add a short "Optional: update notifier" subsection with manual registration (interim), the runtime gate values, the toast behavior, the cache location, and the note that it never updates anything. Note that #273 will add `--plugins` later.
- Architecture: add the notifier entrypoints, the plugin-owned cache boundary, and the interim manual-registration path; state that CLI commands still never check for releases.
- ADR-0049: record the decisions and the #273 follow-up.
- RELEASE: note the optional plugin and that default installs are unchanged.
- Log: short factual entry with validation evidence.

**Step 4: Run test to verify pass**

```powershell
npx vitest run cli/tests/unit/wayforge-update-plugin.test.ts
make check
```

Expected: agent checks pass; human validation above passes or gaps are documented.

**Step 5: Commit**

```sh
git add README.md docs/ai/architecture.md docs/ai/decisions/ADR-0049-runtime-update-notifier.md RELEASE.md docs/ai/logs/2026-11.md
git commit -m "docs: document opt-in update notifier (Issue #239)"
```

## Validation ownership

| Validation | Owner |
|---|---|
| Notifier core tests with mocked clients | agent |
| Runtime gate tests (default-off, `0`/`false` enable) | agent |
| Notifier entrypoint tests | agent |
| `node --check` on plugin files | agent |
| `make check` | agent |
| Architect review before Task 1 implementation | architect |
| OpenCode toast on session creation | human |
| Kilo Code CLI toast | human |
| Kilo Code VS Code extension toast | human |
| Default-off gate and unregistered-plugin suppression | human |
| Missing-toast and network-failure fallback | human |
| ADR/memory update at closure | planner |

## Acceptance criteria

- [ ] The notifier is implemented under `base/plugins/wayforge-update/`, with a shared core and separate OpenCode/Kilo entrypoints.
- [ ] The check is disabled by default; only `WAYFORGE_NO_UPDATE_CHECK=0` or `false` enables it, and unset/empty/`1`/`true`/other values keep it disabled.
- [ ] The shared core reads the installed version and the plugin-owned cache, checks the latest release at most once per 24 hours when enabled, and returns a clear update decision.
- [ ] OpenCode loads the named `server` entrypoint; Kilo Code loads the default `{ id, server }` descriptor; the wrong entrypoint is never used per runtime.
- [ ] A toast appears once per newer version, only when the gate is enabled, and points at `wfg upgrade`.
- [ ] Network/toast/cache failures never break the session; missing toast support degrades to a no-op.
- [ ] The plugin does not update wayforge or managed projects and does not execute remote code.
- [ ] Tests cover the runtime gate, cache/fetch/decision logic, both entrypoints, and failure paths.
- [ ] Manual validation passes in OpenCode and both Kilo Code surfaces (CLI and VS Code extension), or gaps are documented.
- [ ] `make check` is green.
- [ ] README, architecture, ADR-0049, RELEASE, and the monthly log are updated.

## Out of scope

- Installer plugin selection (`--plugins`, interactive prompt, config-gen arrays, manifest behavior) — tracked by #273.
- Reintroducing the withdrawn CLI automatic notice, `update-check.json`, `WAYFORGE_NO_UPDATE_CHECK` behavior in CLI commands, or `WAYFORGE_STATE_DIR` (ADR-0047).
- Changing `wfg update`/`wfg upgrade` behavior or release checksums.
- Managed-project status, updates, pruning, and Git hooks (#238).
- Filtering which plugin files are copied, or pruning deselected plugin files.
- Enabling `session-tracker`/`token-counter` by default.
- Automatic updates from inside the editor.
- TUI dialogs, routes, or non-toast UI.
- Kilo Code's own auto-update setting.

## Risks

| Risk | Mitigation |
|---|---|
| Reusing `WAYFORGE_NO_UPDATE_CHECK` with default-off semantics confuses users | Document the exact values in README/ADR; expose `isUpdateCheckEnabled` for tests; unit-test every accepted value. |
| Plugin is installed but unregistered until #273 lands | Document manual registration as the interim path; #273 adds `--plugins`. |
| OpenCode/Kilo API drift | Use only documented `event`/`session.created` and `client.tui.showToast`; wrap every call in try/catch; no-op when absent; manual validation on both runtimes. |
| Automatic network access from every project | The plugin must be registered and `WAYFORGE_NO_UPDATE_CHECK` must be `0`/`false`; 24-hour cache; 5-second timeout; no mutation. |
| Two runtimes share one plugin directory but need different module shapes | Separate thin `index.js`/`kilo.js` entrypoints over one core. |
| Cache location contradicts ADR-0047's withdrawn state directory | ADR-0049 records a plugin-scoped cache decision and explicitly does not resurrect CLI state/env behavior; architect gate reviews it. |
| Toast nags on every session | `notifiedVersion` in cache plus in-process guard; one toast per version. |

## Dependencies and blockers

- #237 has landed in revised form: `wfg update` checks and `wfg upgrade` installs; there is no shared cache or `self-update` command.
- #273 is the follow-up for installer plugin selection and is **not** part of this plan.
- Depends on the OpenCode and Kilo Code plugin APIs verified on 2026-11-02.
- The stale plan `docs/ai/plans/2026-10-21_113442-issue-239-runtime-update-notifier.md` on `feature/issue-239-runtime-update-notifier` is superseded and should be marked as such when that branch is next touched.
- Parent: #48.
