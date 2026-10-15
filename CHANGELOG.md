# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0]: https://github.com/Macacoders/wayforge/releases/tag/v1.0.0

[0.1.0]: https://github.com/Macacoders/ai-config/releases/tag/v0.1.0
