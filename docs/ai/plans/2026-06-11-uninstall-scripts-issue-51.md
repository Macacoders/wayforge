# Clean Uninstall Scripts (Issue #51)

Date: 2026-06-11  
Status: Completed  
Issue: [#51](https://github.com/Macacoders/ai-config/issues/51)

## Goal

Add a clean uninstall capability through dedicated scripts that remove only files tracked by `.ai-config-managed` from a target repository.

## Phase Summary

### Phase 1: `install/uninstall.sh` (Bash)

- Created `install/uninstall.sh` (234 lines) with:
  - `--repo <path>` and `--dry-run` argument parsing
  - Manifest reading via `read_managed_manifest()` from `lib/managed_sync.sh`
  - File removal loop over `_MANAGED_MANIFEST_PATHS`
  - `.ai-config-managed` self-removal (last)
  - Empty parent directory cleanup via `rmdir` (walks up, stops at repo root)
  - `installed-projects.json` tracking entry removal (jq with line-based fallback)
  - Dry-run isolation, `[ai-config]` logging, summary counts
  - Validated: `bash -n` passes, LF line endings

### Phase 2: `install/uninstall.ps1` + snippet helpers + docs

- Created `install/uninstall.ps1` (165 lines) with equivalent PowerShell logic
- Added `ai-uninstall-repo` / `ai-uninstall-repo-dry-run` to `install/bashrc_snippet.sh`
- Added `Uninstall-AIConfigRepo` / `Uninstall-AIConfigRepoDryRun` (with aliases) to `install/powershell_profile_snippet.ps1`
- Added **Uninstall** section to `README.md` documenting usage, scope, and limitations

## Validation Notes

- All CLI error paths tested (missing repo, missing manifest, unknown options)
- Dry-run tested (lists without modifying)
- `installed-projects.json` cleanup tested (multi-project, last-project, missing file)
- Syntax: `bash -n install/uninstall.sh` passes; PowerShell dot-sources without errors

## Decisions

- **Dedicated scripts** over `--uninstall` flag on bootstrap: separation of concerns, smaller surface, zero regression risk for install path.
- **Manifest-only scope**: only files in `.ai-config-managed` are removed.
- **Modified managed files**: removed unconditionally (still tracked as managed).
- **No confirmation prompt**: `--dry-run` is the safety mechanism.
- **Shell snippets**: convenience helpers added; actual profile sourcing remains manual.
