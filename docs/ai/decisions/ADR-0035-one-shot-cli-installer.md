# ADR-0035: One-Shot CLI Installer

**Date**: 2026-08-24
**Status**: Accepted

## Context

Issue #177 asked for a standard install mechanism for `ai-config`. The original goal recorded in #177 was `./configure && make && make install`, but the project distributable is a prebuilt `bun build --compile` binary plus a static `base/` snapshot. There are no user-facing build flags and no runtime dependency on Node.js for end users, so the install ceremony reduces to "fetch two artifacts and place them in a prefix."

There is also an ambiguity that motivated #177: "install ai-config" can mean either (a) install the CLI itself onto the user machine, or (b) install the ai-config runtime configuration into a target repository. These must be named and surfaced separately.

Two distribution shapes were considered:

- **Option A**: publish the compiled binary and a separate `share` archive (`base/` + `VERSION`), and have the installer place both in a dedicated prefix.
- **Option B**: embed the snapshot inside the compiled binary, producing a single self-contained executable.

## Decision

1. Adopt a **one-shot installer** as the canonical CLI install surface:
   - Linux / macOS: `curl -fsSL https://github.com/Macacoders/ai-config/releases/latest/download/install.sh | sh`
   - Windows: `powershell -c "irm https://github.com/Macacoders/ai-config/releases/latest/download/install.ps1 | iex"`
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
8. Windows execution-policy friction with `irm | iex` is addressed by documentation (`-ExecutionPolicy Bypass`) rather than by a code workaround.

## Consequences

- End users get a familiar Bun-style install experience with no build step and no repository clone required.
- The CLI binary is relocatable because `resolveSourceDir()` (see ADR-0032 second amendment) resolves the snapshot relative to the executable location when `AI_CONFIG_HOME` is unset.
- `installed-projects.json` moves out of the (possibly read-only) source/share directory and into the per-user prefix, removing a regression risk for read-only installed layouts.
- The Makefile keeps `cli-binary` for contributors/CI but does not gain `configure`, `make install`, or `make uninstall` targets.
- A future post-1.0 release can migrate to Option B (embedded single binary) without changing the user-facing install command, because the installer script is fetched fresh for each install.

## Alternatives Considered

- **`./configure && make && make install`** — Rejected: the distributable is a prebuilt binary plus static snapshot; there is no user-facing build configuration.
- **Option B (embedded single binary)** — Rejected for now: cleaner, but requires non-trivial bundling of the snapshot into the compiled binary and is out of scope for the current milestone.
- **Shared prefix under `~/.local`** — Rejected: mixing ai-config files with other tools makes safe uninstall harder; a dedicated prefix lets uninstall be a single `rm -rf`.
