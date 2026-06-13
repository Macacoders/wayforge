# ADR-0010: Dedicated Uninstall Scripts

Date: 2026-06-11  
Status: Accepted  

## Context

Issue #51 requested a clean uninstall capability for ai-config managed files in consuming repositories. Two design approaches were considered:

1. **Flag on existing bootstrap scripts** — Add `--uninstall` / `-Uninstall` to `bootstrap.sh` and `bootstrap.ps1`.
2. **Dedicated uninstall scripts** — Create `install/uninstall.sh` and `install/uninstall.ps1` as standalone counterparts.

## Decision

Use dedicated scripts (`install/uninstall.sh` and `install/uninstall.ps1`) rather than adding an `--uninstall` flag to the bootstrap scripts.

## Rationale

- **Separation of concerns** — Bootstrap installs; uninstall removes. Users don't need to learn an uninstall flag buried in the install script.
- **Smaller surface** — Uninstall scripts only need `--repo` and `--dry-run`. No provider parsing, model overrides, agent presets, or tree syncing. Adding a flag would require ~200+ lines of conditionals in already-dense 850-900 line scripts.
- **Zero regression risk** — Uninstall logic cannot accidentally affect the install path.
- **Discoverability** — `ls install/` shows `bootstrap.sh` + `uninstall.sh` as natural counterparts with the same CLI pattern.

## Consequences

- Two new files to maintain alongside the existing bootstrap scripts.
- Duplicated script setup boilerplate (argument parsing, logging, managed_sync sourcing), kept minimal.
- Both scripts share `lib/managed_sync.sh` / `.ps1` helpers for manifest reading.
