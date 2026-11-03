# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Breaking:** Renamed the `laberit` provider to `openai-compatible` (Issue #275). Install with `--providers openai-compatible`; model IDs are now `openai-compatible/kimi-k2.6` (was `laberit/laberit-ai-preview`), `openai-compatible/kimi-k2.5` (was `laberit/laberit-ai`), `openai-compatible/gpt-5.6-luna`, and `openai-compatible/kimi-k2.7-code`. Environment variables (`OPENAI_BASE_URL` / `OPENAI_API_KEY`), model limits, defaults, and agent pins are unchanged. There is no `laberit` alias; re-run `wfg install --repo <path> --providers openai-compatible --force` to migrate existing installs. See ADR-0048.

### Removed

- Removed `install/legacy/**` (the frozen legacy Bash/PowerShell installers) and its legacy-only bats/Pester tests. `wfg` is the only supported installer. Release artifacts are unchanged. Contributors relying on the frozen source scripts lose them.

### Fixed

- `/memory` (and its `find`, `check`, and `update` intents) runs again: the command's `agent` frontmatter is a single valid owner (`planner`) instead of the unresolvable `planner,delivery`. A new `tests/typescript/base-templates/command-frontmatter.test.ts` guard rejects empty, comma-separated, or unknown command agents, and the `ai-memory` skill documents its installed `.agents/skills/ai-memory/scripts/ai-memory.ts` path.
- The `code` subagent starts again on the balanced `opencode-go` profiles: `opencode-go/glm-5.3-flash` no longer carries `textVerbosity`, which OpenCode sends as the `verbosity` request field that the GLM endpoint rejects. Existing installs keep their generated `opencode.jsonc` unless it is refreshed: run `wfg upgrade`, then `wfg install --repo <repo> --providers opencode-go --force`.

## [1.0.2] - 2026-10-16

### Fixed

- One-shot Windows installer (`install/install.ps1`) now resolves the latest release on both Windows PowerShell 5.1 and PowerShell 7, so `powershell -c "irm .../install.ps1 | iex"` installs without passing `-Version`.
- `install.ps1` now builds asset URLs from the resolved release tag (`.../releases/download/v<tag>/...`) instead of the non-existent `.../releases/download/latest/...`.

## [1.0.0] - 2026-10-15

### Changed

- Clean-break project rename: `ai-config` → `wayforge`. There is no migration path; pre-rename installs and prefixes are abandoned.
- CLI command renamed: `ai-config` → `wfg`.
- GitHub repository renamed: `Macacoders/ai-config` → `Macacoders/wayforge`.
- Environment variables renamed: `AI_CONFIG_*` → `WAYFORGE_*`.
- Managed marker renamed: `.ai-config-managed` → `.wayforge-managed`.
- Install prefix renamed: `~/.ai-config` → `~/.wayforge` (Windows: `%LOCALAPPDATA%\ai-config` → `%LOCALAPPDATA%\wayforge`).
- Release artifacts renamed: `ai-config-*` → `wayforge-*`.

## [0.1.0] - 2026-06-10

### Added

- `VERSION` file at repo root with initial SemVer value `0.1.0`.
- `CHANGELOG.md` to track notable changes per release.
- `RELEASE.md` documenting the release workflow, SemVer convention, branch strategy (`main` as stable, `develop` as active development), release preparation steps, and consuming-repo guidance.
- `docs/ai/decisions/ADR-0009-unified-managed-file-format.md` recording the decision to replace per-file/per-directory `.ai-config-managed` markers with a single project-level `.ai-config-managed` file.
- "Releases & Versioning" section in `README.md` explaining how consuming repos should install from a stable release/tag.
- `main` branch created from `develop` as the stable/release branch.

### Changed

- Unified managed-file infrastructure: replaced per-file `.ai-config-managed` sidecar markers with a single project-level `.ai-config-managed` file containing version and managed paths (ADR-0009).
- Installer now reads the `VERSION` file and records it in the unified manifest.
- Re-install (`bootstrap.sh`/`.ps1`) now auto-detects existing `.ai-config-managed` and performs manifest-aware selective refresh without requiring `--force`: reads existing manifest, refreshes only tracked files, discovers new source templates, and writes updated manifest.
- `--ref` / `-Ref` argument now fetches the specified release source from GitHub and records the ref in `.ai-config-managed`. Without `--ref`, installer uses the local source tree (developer mode).

[1.0.2]: https://github.com/Macacoders/wayforge/releases/tag/v1.0.2
[1.0.0]: https://github.com/Macacoders/wayforge/releases/tag/v1.0.0

[0.1.0]: https://github.com/Macacoders/ai-config/releases/tag/v0.1.0
