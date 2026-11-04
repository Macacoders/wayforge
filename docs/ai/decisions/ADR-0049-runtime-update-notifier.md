# ADR-0049: Opt-in Runtime Update Notifier Plugin

Date: 2026-11-02
Amended: 2026-11-03 (PR #274 review)
Status: Accepted

## Context

ADR-0047 removed the automatic release notice, the 24-hour cache, `update-check.json`, `WAYFORGE_NO_UPDATE_CHECK`, and cache-related `WAYFORGE_STATE_DIR` from the CLI: installed users get no in-band signal that a new release exists. Issue #239 revisits passive discovery, but only as an **opt-in runtime plugin** for OpenCode and Kilo Code — never as CLI behavior. The installer registers only the ponytail plugin today (`cli/src/lib/config-gen.ts` emits a one-element `plugin` array), so installer plugin selection is a separate follow-up (#273); until it lands, activation is manual registration in the generated runtime config.

## Decision

1. **`WAYFORGE_UPDATE_CHECK` is an affirmative, plugin-only opt-in gate.** The update check is disabled by default: unset, empty, `0`, `false`, or any other value keeps it disabled; only `1` or `true` (trimmed, case-insensitive) enables it. This is a new flag, deliberately distinct from the `WAYFORGE_NO_UPDATE_CHECK` opt-out that ADR-0047 withdrew from the CLI: **no CLI command reads this flag** and ADR-0047's Decision 2 (no automatic release checks in CLI commands) stands unchanged. The dual gate is: the plugin must be registered in the runtime config **and** `WAYFORGE_UPDATE_CHECK` must be `1`/`true`.

2. **The notifier owns its cache; it is not the withdrawn CLI cache.** The plugin writes `<user cache>/wayforge/update-notifier.json` (`%LOCALAPPDATA%\wayforge\update-notifier.json` on Windows, `${XDG_CACHE_HOME:-~/.cache}/wayforge/update-notifier.json` on Unix) with its own numeric schema (`schemaVersion: 1`, `lastChecked`, `latestVersion`, `notifiedVersion`). Corrupt JSON or a mismatched schema is discarded. It never reads or writes CLI state (`installed-projects.json`), does not resurrect `update-check.json` or `WAYFORGE_STATE_DIR`, and has no compatibility alias. `WAYFORGE_NOTIFIER_CACHE` is an absolute-path override honored **only** when `WAYFORGE_NOTIFIER_TEST=1`; in production it is ignored and the real user-cache path is used. Likewise `WAYFORGE_VERSION` is honored only in test mode and must parse as semver (invalid values no-op like an unparseable `VERSION` file); otherwise the installed version comes from `<prefix>/share/wayforge/VERSION`. Cache writes are atomic (same-directory temp file + rename, temp cleanup on failure), so a crash never leaves a half-written cache and the final write never follows a symlink. The plugin deliberately ignores `WAYFORGE_HOME`, which is a `resolveSourceDir()`-only CLI dev-mode override (`cli/src/lib/source-dir.ts`), not an install-prefix variable.

3. **Network/trust boundary and no-mutation guarantee.** When enabled, the plugin performs one outbound `fetch` to `https://github.com/Macacoders/wayforge/releases/latest` — the release root is a compile-time constant and `WAYFORGE_RELEASE_ROOT` is honored only in test mode (`WAYFORGE_NOTIFIER_TEST=1`) — with `redirect: 'manual'`, a 5-second timeout, and the constant `User-Agent: wayforge-update-notifier` (the installed version is never sent to the server). The redirect `Location` must be HTTPS on `github.com` under `/Macacoders/wayforge/releases/tag/` and end in a semver tag; anything else is rejected as a silent no-op, and the response body is cancelled before returning or throwing. The check runs only inside a runtime session (`session.created` event), at most once per 24 hours per user cache, and never installs, downloads code, mutates the project or the install, or executes remote content. The notifier only informs; updating stays with `wfg upgrade`.

4. **Cross-runtime module shapes.** OpenCode loads a named `server` export (`base/plugins/wayforge-update/index.js`); Kilo Code loads a default `{ id: 'wayforge-update', server }` descriptor (`kilo.js`). Both are thin adapters over one shared core (`core.js`) that imports only Node built-ins and uses global `fetch`, so neither runtime needs to resolve `@opencode-ai/plugin` or `@kilocode/plugin`. The toast uses `client.tui.showToast({ body: { message, variant: 'info' } })` with the message `wayforge v<latest> is available (installed v<current>). Run \`wfg upgrade\` to update.` — `wfg self-update` no longer exists and is never mentioned.

5. **Graceful degradation and non-blocking delivery.** The `session.created` hook is fire-and-forget: it triggers `checkAndNotify()` and returns immediately, never awaiting the network, so session creation is never delayed by the lookup. A missing or throwing `client.tui.showToast`, an unreachable release root, an unreadable `VERSION`, and unwritable cache paths are all silent no-ops. A failed cache write falls back to in-process state so a single runtime session does not toast repeatedly, and failed lookups still advance `lastChecked` so an outage cannot add a 5-second timeout to every session. An in-flight guard prevents concurrent `session.created` events from racing.

6. **Interim manual registration.** Until #273 lands, users activate the notifier by adding the entrypoint to the generated runtime config by hand:
   - OpenCode: add `./.agents/plugins/wayforge-update/index.js` to the `plugin` array in `opencode.jsonc`.
   - Kilo Code: add `./.agents/plugins/wayforge-update/kilo.js` to the `plugin` array in `kilo.jsonc`.
   Registration alone is not enough — `WAYFORGE_UPDATE_CHECK=1` (or `true`) is also required. Because `opencode.jsonc`/`kilo.jsonc` are regenerated only with `--force`, a normal reinstall preserves the manual entry, but `--force` overwrites it and the user must re-apply it. #273 will add the supported installer selection surface (`--plugins`).

7. **Follow-up.** #273 owns installer plugin selection (`--plugins`, interactive prompt, config-gen plugin arrays, manifest behavior). This ADR covers only the plugin and its documentation.

## Consequences

- **Default installs are unchanged.** The plugin is installed as files under `.agents/plugins/wayforge-update/` but is not registered, so nothing runs, nothing reads the cache, and no network call happens unless a user both registers the entrypoint and sets the gate.
- **Known duplication (accepted debt):** the plugin duplicates semver parsing/comparison and the release-redirect lookup that also live in `cli/src/lib/{version,release}.ts`. Sharing would require a build step or a shared package, which the dependency-free plugin constraint forbids; the duplication is accepted and marked here rather than abstracted.
- **Background lookup latency:** the 5-second fetch timeout happens in the background — the `session.created` hook returns before the lookup resolves — so it never blocks or delays session creation; the toast simply appears later when a newer release exists.
- **Windows cache placement:** the plugin's default cache lives under the install prefix on Windows (`%LOCALAPPDATA%\wayforge\update-notifier.json`) because both the prefix and the user cache resolve to `%LOCALAPPDATA%\wayforge`; Unix uses the XDG cache dir. This is a coincidence of the default layout, not shared state with the CLI.
- **Tooling coverage:** `tsc`, ESLint, and Prettier cover only `cli/src/**`; jscpd scans `**/*.ts` (so it does cover `cli/tests/**`) and ignores `base/**`. The plugin's `.js` files are outside those gates, but `make check` now runs `node --check` on all three plugin files, and correctness rests on that plus the dedicated Vitest suite (`cli/tests/unit/wayforge-update-plugin.test.ts`).
- **Manual validation is human-owned.** Toast behavior in OpenCode, the Kilo Code CLI, and the Kilo Code VS Code extension must be confirmed by hand; unit tests only mock the clients. This explicitly includes the unregistered-install check: with the plugin installed but not registered, no cache file is created, no network request is made, and no toast appears in OpenCode, the Kilo CLI, and Kilo VS Code. Any runtime that cannot show the toast must be documented as a gap rather than claimed as supported.

## Related

- [ADR-0047](ADR-0047-cli-release-detection-and-self-update.md) — withdrew the CLI automatic notice/cache; its Decision 2 stands.
- [ADR-0018](ADR-0018-ts-plugin-migration-analysis.md) — records the installer's single-plugin registration gap that #273 closes.
- Plan: `docs/ai/plans/2026-11-02_103741-issue-239-runtime-update-notifier-opt-in.md`
