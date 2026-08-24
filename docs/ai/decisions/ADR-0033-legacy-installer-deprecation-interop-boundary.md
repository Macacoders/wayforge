# ADR-0033: Legacy Installer Deprecation and Interop Boundary

**Date**: 2026-08-21
**Status**: Accepted
**Amended**: 2026-08-24 — the frozen legacy set now also includes the retired thin entrypoints `bootstrap-thin.{sh,ps1}` (moved from `install/bootstrap.{sh,ps1}`). They are retained as reference only and are not the canonical install surface.

## Context

The TypeScript CLI (`cli/src`) is the canonical installer. The legacy Bash and PowerShell installers under `install/legacy/` (`bootstrap-legacy.{sh,ps1}`, `lib/managed_sync-legacy.{sh,ps1}`, `uninstall-legacy.{sh,ps1}`), together with the retired thin wrappers `bootstrap-thin.{sh,ps1}`, remain in the repository as frozen reference and fallback during the migration.

ADR-0009 (amended 2026-08-21) changed the `.ai-config-managed` format to use a blank line after `managed_paths:` and column-0 `- ` list items. The legacy parsers were intentionally not updated: they treat a blank line as the list terminator and match only the `  - ` prefix, so they read a TS-CLI-written manifest as containing zero managed paths.

## Decision

1. The TS CLI is the sole canonical installer. The legacy Bash and PowerShell installers are frozen and will not receive `.ai-config-managed` format updates.
2. Legacy installers may not correctly read TS-CLI-written manifests (accepted interop break). They must not be run against repositories installed by the TS CLI.
3. The legacy uninstall scripts cannot clean up TS-CLI-installed projects.
4. Deletion trigger: the legacy installers are removed once the TS CLI migration is complete and integration parity is established (no fixed date).

## Consequences

- Consumers who run the legacy installer against a TS-CLI-installed repository will silently see zero managed paths, causing re-install to recreate per-file sidecar markers and uninstall to leave managed files behind.
- Contributors must not add `.ai-config-managed` format features to the legacy installers; such work goes to the TS CLI only.
- The interop break is a known, accepted tradeoff rather than a hidden defect, and is documented here for future readers.

## Alternatives Considered

- **Keep legacy installers in sync with format changes** — Rejected: they are deprecated, and investing in them is waste.
- **Delete the legacy installers immediately** — Rejected: they still serve as reference/fallback during the migration; deletion awaits the completion trigger above.
