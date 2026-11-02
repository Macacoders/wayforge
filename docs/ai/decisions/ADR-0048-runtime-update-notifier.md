# ADR-0048: Opt-in Runtime Update Notifier Plugin

Date: 2026-11-02
Status: Accepted

## Context

ADR-0047 removed the automatic release notice, the 24-hour cache, `update-check.json`, `WAYFORGE_NO_UPDATE_CHECK`, and cache-related `WAYFORGE_STATE_DIR` from the CLI: installed users get no in-band signal that a new release exists. Issue #239 revisits passive discovery, but only as an **opt-in runtime plugin** for OpenCode and Kilo Code — never as CLI behavior. The installer registers only the ponytail plugin today (`cli/src/lib/config-gen.ts` emits a one-element `plugin` array), so installer plugin selection is a separate follow-up (#273); until it lands, activation is manual registration in the generated runtime config.

## Decision

1. **`WAYFORGE_NO_UPDATE_CHECK` is reinterpreted as a default-off enable switch, plugin-only.** The update check is disabled by default: unset, empty, `1`, `true`, or any other value keeps it disabled; only an explicit `0` or `false` (case-insensitive) enables it. This deliberately reuses the flag ADR-0047 withdrew from the CLI, but with inverted semantics and a different owner: **no CLI command reads this flag** and ADR-0047's Decision 2 (no automatic release checks in CLI commands) stands unchanged. The dual gate is: the plugin must be registered in the runtime config **and** the flag must be `0`/`false`.

2. **The notifier owns its cache; it is not the withdrawn CLI cache.** The plugin writes `<user cache>/wayforge/update-notifier.json` (`%LOCALAPPDATA%\wayforge\update-notifier.json` on Windows, `${XDG_CACHE_HOME:-~/.cache}/wayforge/update-notifier.json` on Unix) with its own numeric schema (`schemaVersion: 1`, `lastChecked`, `latestVersion`, `notifiedVersion`). Corrupt JSON or a mismatched schema is discarded. It never reads or writes CLI state (`installed-projects.json`), does not resurrect `update-check.json` or `WAYFORGE_STATE_DIR`, and has no compatibility alias. `WAYFORGE_NOTIFIER_CACHE` is an absolute-path override that exists only as a test/manual-validation seam. The plugin deliberately ignores `WAYFORGE_HOME`, which is a `resolveSourceDir()`-only CLI dev-mode override (`cli/src/lib/source-dir.ts`), not an install-prefix variable.

3. **Network/trust boundary and no-mutation guarantee.** When enabled, the plugin performs one outbound `fetch` to `${WAYFORGE_RELEASE_ROOT || 'https://github.com/Macacoders/wayforge/releases'}/latest` with `redirect: 'manual'`, a 5-second timeout, and `User-Agent: wayforge/<current>`; the tag is parsed from the redirect `Location` (mirroring `cli/src/lib/release.ts`). It runs only inside a runtime session (`session.created` event), at most once per 24 hours per user cache, and never installs, downloads code, mutates the project or the install, or executes remote content. The notifier only informs; updating stays with `wfg upgrade`.

4. **Cross-runtime module shapes.** OpenCode loads a named `server` export (`base/plugins/wayforge-update/index.js`); Kilo Code loads a default `{ id: 'wayforge-update', server }` descriptor (`kilo.js`). Both are thin adapters over one shared core (`core.js`) that imports only Node built-ins and uses global `fetch`, so neither runtime needs to resolve `@opencode-ai/plugin` or `@kilocode/plugin`. The toast uses `client.tui.showToast({ body: { message, variant: 'info' } })` with the message `wayforge v<latest> is available (installed v<current>). Run \`wfg upgrade\` to update.` — `wfg self-update` no longer exists and is never mentioned.

5. **Graceful degradation.** A missing or throwing `client.tui.showToast`, an unreachable release root, an unreadable `VERSION`, and unwritable cache paths are all silent no-ops; failures never block session creation. A failed cache write falls back to in-process state so a single runtime session does not toast repeatedly, and failed lookups still advance `lastChecked` so an outage cannot add a 5-second timeout to every session. An in-flight guard prevents concurrent `session.created` events from racing.

6. **Interim manual registration.** Until #273 lands, users activate the notifier by adding the entrypoint to the generated runtime config by hand:
   - OpenCode: add `./.agents/plugins/wayforge-update/index.js` to the `plugin` array in `opencode.jsonc`.
   - Kilo Code: add `./.agents/plugins/wayforge-update/kilo.js` to the `plugin` array in `kilo.jsonc`.
   Registration alone is not enough — the `WAYFORGE_NO_UPDATE_CHECK=0|false` gate is also required. Because `opencode.jsonc`/`kilo.jsonc` are regenerated only with `--force`, a normal reinstall preserves the manual entry, but `--force` overwrites it and the user must re-apply it. #273 will add the supported installer selection surface (`--plugins`).

7. **Follow-up.** #273 owns installer plugin selection (`--plugins`, interactive prompt, config-gen plugin arrays, manifest behavior). This ADR covers only the plugin and its documentation.

## Consequences

- **Default installs are unchanged.** The plugin is installed as files under `.agents/plugins/wayforge-update/` but is not registered, so nothing runs, nothing reads the cache, and no network call happens unless a user both registers the entrypoint and sets the gate.
- **Known duplication (accepted debt):** the plugin duplicates semver parsing/comparison and the release-redirect lookup that also live in `cli/src/lib/{version,release}.ts`. Sharing would require a build step or a shared package, which the dependency-free plugin constraint forbids; the duplication is accepted and marked here rather than abstracted.
- **`WAYFORGE_VERSION` is not semver-validated** in the plugin (it is a test seam mirroring the CLI); an invalid value never yields a valid comparison, so no toast is shown (the release lookup and cache write still run).
- **Windows cache placement:** the plugin's default cache lives under the install prefix on Windows (`%LOCALAPPDATA%\wayforge\update-notifier.json`) because both the prefix and the user cache resolve to `%LOCALAPPDATA%\wayforge`; Unix uses the XDG cache dir. This is a coincidence of the default layout, not shared state with the CLI.
- **First enabled session latency:** the first session after the cache goes stale can be delayed up to the 5-second fetch timeout; subsequent sessions within 24 hours read the cache instead.
- **Tooling coverage gap:** `tsc`, ESLint, and Prettier cover only `cli/src/**`; jscpd scans `**/*.ts` (so it does cover `cli/tests/**`) and ignores `base/**`. The plugin's `.js` files are therefore outside all of those gates, and correctness rests on the dedicated Vitest suite (`cli/tests/unit/wayforge-update-plugin.test.ts`) plus manual runtime validation.
- **Manual validation is human-owned.** Toast behavior in OpenCode, the Kilo Code CLI, and the Kilo Code VS Code extension must be confirmed by hand; unit tests only mock the clients. Any runtime that cannot show the toast must be documented as a gap rather than claimed as supported.

## Related

- [ADR-0047](ADR-0047-cli-release-detection-and-self-update.md) — withdrew the CLI automatic notice/cache; its Decision 2 stands.
- [ADR-0018](ADR-0018-ts-plugin-migration-analysis.md) — records the installer's single-plugin registration gap that #273 closes.
- Plan: `docs/ai/plans/2026-11-02_103741-issue-239-runtime-update-notifier-opt-in.md`
