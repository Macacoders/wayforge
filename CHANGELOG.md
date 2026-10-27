# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `/deliver` — delivers a small, low-risk change end to end: risk classification, one bounded implementation work order, independent review, and commit. No intent or plan artifact required.
- `/deliver-plan` — executes an approved plan autonomously: dependency-driven task readiness, dispatch, independent review, bounded repair, optional integration review, and plan-level acceptance. Stops only on completion, a blocker, or a decision only the user can make.
- `reviewer` subagent — read-only independent verification (`edit: deny`, mutating shell prefixes denied) returning `pass | changes_required | blocked` with actionable findings and the reviewed revision.
- `delivery-policy` skill — the single owning location for risk classification, work-order kinds and contracts, worker result format, acceptance gates, retry/escalation budgets, and commit authority.

### Changed

- The workflow is now proportionate to risk: small localized fixes take the `direct` path without intent or plan artifacts, while boundary-affecting or ambiguous work keeps intent, planning, and boundary review. Risk defaults to the full path when unknown, and a user-declared low-risk classification cannot cross a hard safety boundary.
- `delivery` owns the review gate but no longer performs the review, and never accepts a change from its own reading of the diff.
- Plan tasks are outcome-based contracts (objective, context, acceptance criteria, constraints, dependencies, owned validations). The mandatory five-step task template, the 2–5 minute granularity rule, and the copy-the-Steps handoff are removed.
- Task readiness now comes from per-task `**Status:**` and `**Depends on:**`; `task: <n>/<total>` is kept as a compatibility cursor.
- Plans written before this release remain executable: with no per-task status or dependencies, readiness is derived from the `task:` cursor, dependencies default to the previous task, the fields are backfilled during dispatch, legacy commit steps are dropped, and missing acceptance criteria block the review instead of being invented.
- Retry and escalation are deterministic: bounded repair/review budgets per run replace the prose "ask the user a second time" rule, and exhaustion produces one escalation question with what was tried and the options.
- `/load-plan`, `/implement-task`, and `/review-task` remain as the manual low-level path and now dispatch work orders and independent review instead of copying plan steps and self-reviewing.
- `troubleshooter` can hand a confirmed root cause to `/deliver` (or `/plan` for boundary triggers) instead of restarting the planning chain.
- `research` now covers bounded investigation work orders in addition to repository onboarding.
- Workflow policy lives in one owning location; duplicated rules were removed from `delivery`, `review-task`, and `docs/ai/architecture.md`. The remaining restatements are enumerated as deliberate in ADR-0048.

### Removed

- The mandatory five-step plan task template (establish behaviour → add validation → minimal implementation → run test → commit) and the "2–5 minutes of focused work" task granularity rule. Tasks are now coherent, independently reviewable outcomes.
- The per-atomic-step manual validation pause and the Step Loop in the `code` agent.
- `delivery`'s self-review of the work it dispatched; verification is now exclusively `reviewer` (plus `architect` for boundary changes).
- The per-task memory freshness pass and per-task gate sweep in `/review-task`; both move to plan close and to the gates a plan actually declares.
- The prose retry rule ("ask the user a second time") and the copy-the-Steps handoff brief.

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
