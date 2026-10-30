# ADR-0035: One-Shot CLI Installer

**Date**: 2026-08-24
**Status**: Accepted
**Amended**: 2026-08-25 — tracking relocation and WSL storage semantics made explicit (Decision 9–10).
**Amended**: 2026-10-06 — Node.js provisioning added; the "no runtime dependency on Node.js" statement is superseded (Decision 11).
**Amended**: 2026-10-27 — release-asset checksum verification added to the one-shot installers (Decision 13).
**Amended**: 2026-10-30 — signed checksum bundle and `--no-modify-path` (Decisions 14-15; see ADR-0048).

## Context

Issue #177 asked for a standard install mechanism for `ai-config`. The original goal recorded in #177 was `./configure && make && make install`, but the project distributable is a prebuilt `bun build --compile` binary plus a static `base/` snapshot. There are no user-facing build flags, so the install ceremony reduces to "fetch two artifacts and place them in a prefix." (Amended 2026-10-06: the installed workflow runs `npx tsx` at use time, so end users do have a Node.js >= 18 dependency; the one-shot installer now provisions it — see Decision 11.)

There is also an ambiguity that motivated #177: "install ai-config" can mean either (a) install the CLI itself onto the user machine, or (b) install the ai-config runtime configuration into a target repository. These must be named and surfaced separately.

Two distribution shapes were considered:

- **Option A**: publish the compiled binary and a separate `share` archive (`base/` + `VERSION`), and have the installer place both in a dedicated prefix.
- **Option B**: embed the snapshot inside the compiled binary, producing a single self-contained executable.

## Decision

1. Adopt a **one-shot installer** as the canonical CLI install surface. (Amended 2026-10-30: the recommended path is download-to-file → verify SHA-256 → dry-run → run; the `curl | sh` / `irm | iex` cradle is no longer the recommended path — see Decision 14 and ADR-0048.)
   - Linux / macOS:
     ```sh
     curl -fsSLO https://github.com/Macacoders/wayforge/releases/latest/download/install.sh
     curl -fsSLO https://github.com/Macacoders/wayforge/releases/latest/download/wayforge-checksums.txt
     grep '  install.sh$' wayforge-checksums.txt | sha256sum -c -
     sh install.sh --dry-run
     sh install.sh
     ```
   - Windows:
     ```powershell
     Invoke-WebRequest -Uri https://github.com/Macacoders/wayforge/releases/latest/download/install.ps1 -OutFile install.ps1
     Invoke-WebRequest -Uri https://github.com/Macacoders/wayforge/releases/latest/download/wayforge-checksums.txt -OutFile wayforge-checksums.txt
     $expected = (Select-String -Path wayforge-checksums.txt -Pattern '  install\.ps1$').Line.Split()[0]
     if ((Get-FileHash install.ps1 -Algorithm SHA256).Hash -ne $expected.ToUpper()) { throw 'install.ps1 checksum mismatch' }
     pwsh -File install.ps1 -DryRun
     pwsh -File install.ps1
     ```
   This replaces the `./configure && make && make install` goal from #177.
2. Choose **Option A (two artifacts)** for the distribution: the release publishes the compiled binary **and** a `share` archive. A single embedded binary (Option B) is the cleaner end-state but is a larger rewrite deferred to a post-1.0 simplification.
3. Use a **dedicated self-contained prefix** (Bun/Rust/Homebrew pattern), not a shared `~/.local`:
   - Linux / macOS: `~/.ai-config/`
   - Windows: `%LOCALAPPDATA%\ai-config\`
   Layout: `bin/ai-config`, `share/ai-config/` (snapshot), and `installed-projects.json` (per-user tracking).
4. Name four distinct operations to resolve the install/uninstall ambiguity:
   - **Install the CLI** (self): `install.sh` / `install.ps1`
   - **Uninstall the CLI** (self): `install.sh --uninstall` / `install.ps1 -Uninstall`
   - **Install config into a repo**: `ai-config install --repo <path>`
   - **Uninstall config from a repo**: `ai-config uninstall --repo <path>`
5. Register PATH without touching unrelated content:
   - Linux / macOS: print the export line and best-effort append to `~/.bashrc` / `~/.zshrc` behind a `# >>> ai-config >>>` marker block; only add when absent.
   - Windows: silently add the `bin` directory to the **User** PATH via `[Environment]::SetEnvironmentVariable('Path', ..., 'User')`, which requires no elevation.
6. **Self-uninstall** removes the entire owned prefix directory and the exact PATH marker it added. `--dry-run` / `-DryRun` previews actions. No file manifest is required because everything lives under the one owned directory.
7. Snapshot granularity is the full `base/` + `VERSION` directory; the archive is small and avoids subset fragility.
8. Windows execution-policy friction is addressed by documentation (`-ExecutionPolicy Bypass`) rather than by a code workaround. (Amended 2026-10-30: the recommended flow downloads the installer to a file and runs it, avoiding the `irm | iex` cradle that pipes remote content into `Invoke-Expression`; see Decision 14 and `docs/security/installer-trust.md`.)
9. **Per-user tracking relocation**: `installed-projects.json` is read/written under `resolveStateDir()` (`~/.ai-config` / `%LOCALAPPDATA%\ai-config`); the `rootDir` parameter was dropped from `trackInstalledProject`/`removeTrackingEntry`. Tracking is independent of the (possibly read-only) install location.
10. **WSL path semantics**: on WSL, `toTrackedPath()` converts the canonical install path to a Windows-native path (via `wslpath -w`) before storing; uninstall matches symmetrically. `isTempPath()` gates `%TEMP%` handling on `process.platform === 'win32'` (see the ADR-0031 amendment).
11. **Node.js provisioning** (2026-10-06): the one-shot installer detects Node.js >= 18 on PATH and, when missing or too old, downloads a pinned Node.js release (`NODE_VERSION` / `$NodeVersion`, currently 24.13.0) from `nodejs.org/dist` into the owned prefix (`${PREFIX}/node` / `$Prefix\node`), adds it to PATH, and verifies it before continuing. `--skip-node-check` / `-SkipNodeCheck` bypasses detection and provisioning; `--dry-run` / `-DryRun` prints the plan without downloading. Self-uninstall removes the provisioned Node.js and its PATH entry along with the rest of the prefix (Decision 6). Policy: checksum verification of the nodejs.org download is deliberately out of scope (accepted risk); release assets are now verified against `wayforge-checksums.txt` per Decision 13, and the nodejs.org download remains outside that posture; the download base is overridable via `AI_CONFIG_NODE_BASE_URL` for tests. The provisioned Node.js is prepended to the user's PATH, so it becomes that user's default Node until uninstall. The provisioned Node.js is static until uninstall/reinstall; `NODE_VERSION` / `$NodeVersion` is bumped in the release checklist.
12. **CLI repo-install Node prerequisite gate** (2026-10-06): the TypeScript CLI's `doInstall` (used by `ai-config install --repo` and `ai-config interactive`) runs a Node.js prerequisite check (`checkNode()` in `cli/src/lib/prereq.ts`) after the repo-exists guard and before any filesystem mutation. If Node.js is missing or below major 18, it logs `[ai-config] error: Node.js >= 18 is required (...)` and exits non-zero unless `--skip-node-check` is passed; `--dry-run` logs the check result and continues without failing. `ai-config interactive` inherits the gate because it delegates to `doInstall`; it does not expose its own bypass flag.
13. **Release-asset checksum verification** (2026-10-27): Both installers fetch `wayforge-checksums.txt` from the same release base URL as the assets and, on real installs, verify the SHA-256 of the platform binary and the share archive **before any prefix mutation** — before Node.js provisioning, directory creation, chmod/move, or extraction. POSIX uses `sha256sum`, falling back to `shasum -a 256`; Windows uses `Get-FileHash -Algorithm SHA256`. Entries are matched by bare asset name (basename), mirroring `parseChecksums` in `cli/src/lib/upgrade.ts`; the parsing duplication is intentional (the installers are standalone single files) and is pinned by fixtures on both sides against the release workflow's generation format. A present checksum file with a missing entry or a mismatched digest is a hard failure with the prefix untouched. Only a confirmed-missing checksum asset (HTTP 404; releases predating it) warns and continues unverified: this fallback is **fail-open by design** for backward compatibility and is deliberately asymmetric with `wfg upgrade`, which fails closed when the checksum file cannot be fetched. Every other fetch failure (403, 5xx, timeout, TLS) aborts with the prefix untouched. Residual risk accepted: an actor able to make the checksum asset return 404 on the release channel (or a `--url-base` mirror lacking it) can force the unverified fallback; under the ADR-0047 same-origin trust model such an actor can already rewrite asset and checksum together, so this widens availability edge cases, not the core compromise path. The nodejs.org download remains out of scope (Decision 11). (Amended 2026-10-30: when the checksum manifest is fetched successfully, `install.sh` additionally verifies its cosign signature bundle before checking any asset hash — see Decision 14.)

14. **Cosign keyless bundle verification** (2026-10-30): the release signs `wayforge-checksums.txt` with cosign keyless (v3.1.4, Fulcio + Rekor) into a detached `wayforge-checksums.txt.sigstore.json` bundle; the trust anchor is the GitHub Actions workflow identity `release.yml@refs/heads/main` (see ADR-0048). `install.sh` verifies the bundle with `cosign verify-blob --bundle` against the pinned identity regexp `^https://github.com/Macacoders/wayforge/.github/workflows/release.yml@refs/heads/main$` and issuer `https://token.actions.githubusercontent.com` whenever cosign is on PATH, before any asset hash is checked. Policy: cosign absent → warn and continue (hash-only); bundle confirmed missing (HTTP 404) → warn and continue; bundle fetch failure (non-404) or failed verification → abort with the prefix untouched. `install.ps1` does not require cosign and documents manual `cosign verify-blob --bundle` verification. The full trust model and user-facing commands live in `docs/security/installer-trust.md`.

15. **PATH opt-out** (2026-10-30): `--no-modify-path` / `-NoModifyPath` skips all persistent PATH writes and removals — the `~/.bashrc` / `~/.zshrc` marker block on POSIX and the Windows User PATH entry — on both install and uninstall, and prints manual PATH instructions instead. Dry-run reports the skip. Without the flag, behavior is unchanged (Decision 5).

## Consequences

- End users get a familiar Bun-style install experience with no build step and no repository clone required.
- The installed workflow depends on Node.js >= 18 at use time (`npx tsx`); the one-shot installer provisions it user-locally when absent (Decision 11), so a fresh machine needs no manual Node.js install.
- The CLI binary is relocatable because `resolveSourceDir()` (see ADR-0032 second amendment) resolves the snapshot relative to the executable location when `AI_CONFIG_HOME` is unset.
- `installed-projects.json` moves out of the (possibly read-only) source/share directory and into the per-user prefix, removing a regression risk for read-only installed layouts.
- Tracking survives a relocated or read-only install location because it is written to the per-user prefix, not the source/share directory (Decision 9); on WSL the stored path is Windows-native (Decision 10).
- The Makefile keeps `cli-binary` for contributors/CI but does not gain `configure`, `make install`, or `make uninstall` targets.
- A future post-1.0 release can migrate to Option B (embedded single binary) without changing the user-facing install command, because the installer script is fetched fresh for each install.

## Alternatives Considered

- **`./configure && make && make install`** — Rejected: the distributable is a prebuilt binary plus static snapshot; there is no user-facing build configuration.
- **Option B (embedded single binary)** — Rejected for now: cleaner, but requires non-trivial bundling of the snapshot into the compiled binary and is out of scope for the current milestone.
- **Shared prefix under `~/.local`** — Rejected: mixing ai-config files with other tools makes safe uninstall harder; a dedicated prefix lets uninstall be a single `rm -rf`.
