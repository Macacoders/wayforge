# ADR-0033: Legacy Installer Deprecation and Interop Boundary

**Date**: 2026-08-21
**Status**: Accepted
**Amended**: 2026-08-24 — the frozen legacy set now also includes the retired thin entrypoints `bootstrap-thin.{sh,ps1}` (moved from `install/bootstrap.{sh,ps1}`). They are retained as reference only and are not the canonical install surface.
**Amended**: 2026-10-26 — the deletion trigger was executed: the eight `install/legacy/**` files plus the legacy-only bats/Pester tests were removed. The parity arm of Decision 4 was retired as stale (parity was never established; the TS CLI is the only installer).

## Context

The TypeScript CLI (`cli/src`) is the canonical installer. During the migration, the legacy Bash and PowerShell installers under `install/legacy/` (`bootstrap-legacy.{sh,ps1}`, `lib/managed_sync-legacy.{sh,ps1}`, `uninstall-legacy.{sh,ps1}`), together with the retired thin wrappers `bootstrap-thin.{sh,ps1}`, were retained as frozen reference and fallback. The deletion trigger was executed on 2026-10-26; these files no longer remain in this repository.

ADR-0009 (amended 2026-08-21) changed the `.ai-config-managed` format to use a blank line after `managed_paths:` and column-0 `- ` list items. The legacy parsers were intentionally not updated: they treat a blank line as the list terminator and match only the `  - ` prefix, so they read a TS-CLI-written manifest as containing zero managed paths.

## Decision

1. The TS CLI is the sole canonical installer. The legacy Bash and PowerShell installers are frozen and will not receive `.ai-config-managed` format updates.
2. Legacy installers may not correctly read TS-CLI-written manifests (accepted interop break). They must not be run against repositories installed by the TS CLI.
3. The legacy uninstall scripts cannot clean up TS-CLI-installed projects.
4. Deletion trigger (executed 2026-10-26): the legacy installers were removed once the TS CLI migration was complete. The integration-parity arm was retired as stale — parity was never established, and the TS CLI is the sole installer.

## Consequences

- Consumers who run the legacy installer against a TS-CLI-installed repository will silently see zero managed paths, causing re-install to recreate per-file sidecar markers and uninstall to leave managed files behind.
- Contributors must not add `.ai-config-managed` format features to the legacy installers; such work goes to the TS CLI only.
- The interop break is a known, accepted tradeoff rather than a hidden defect, and is documented here for future readers.
- After the 2026-10-26 removal, the historical interop warnings above apply only to out-of-tree copies of the frozen scripts; no legacy installers remain in this repository.

## Alternatives Considered

- **Keep legacy installers in sync with format changes** — Rejected: they are deprecated, and investing in them is waste.
- **Delete the legacy installers immediately** — Rejected: they still serve as reference/fallback during the migration; deletion awaits the completion trigger above.
