# ADR-0047: CLI Release Detection and Verified Self-Update

Date: 2026-10-21
Status: Accepted

## Context

The installed `wfg` CLI had no way to learn about new GitHub releases or to upgrade itself. Issue #237 adds (Task 1) a cached release check with a one-line notice, and (Task 2) a `wfg self-update` command that downloads the release binary and share archive, verifies SHA-256 checksums, and replaces the install with backup/rollback.

The `architect` review of Task 1 accepted the design with conditions that had to be recorded and honoured by Task 2. This ADR records the resulting decisions.

## Decision

1. **Trust anchor and same-origin checksum limits.** The release root (`WAYFORGE_RELEASE_ROOT`, default `https://github.com/Macacoders/wayforge/releases`) is the trust anchor. `wayforge-checksums.txt` is fetched from the same origin as the assets it describes, so it defends against transit corruption and mis-published asset bytes, **not** against a compromised release channel (a channel attacker can rewrite both asset and checksum). Asset signing or checksum pinning is deliberately out of scope; revisit if the release channel threat model changes.

2. **Latency budget and opt-outs.** The automatic notice performs at most one 5-second-timeout network call per 24 hours per user (cache-first; failed attempts are cached too so an outage cannot add the timeout to every command). It runs only for an installed binary, on a TTY, outside CI, and never for blocked commands (`update`, `hooks`, `uninstall`, `self-update`). `WAYFORGE_NO_UPDATE_CHECK=1` disables it; `WAYFORGE_STATE_DIR` relocates the cache. `self-update` itself is always user-initiated and never runs automatically.

3. **Cache placement.** The update-check cache lives in the per-user state directory from `release.resolveUpdateStateDir()`: `%LOCALAPPDATA%\wayforge` on Windows (falling back to `%APPDATA%\wayforge`, then `~/.wayforge`), `${XDG_STATE_HOME:-~/.local/state}/wayforge` on Unix. On a default Windows install this coincides with the install prefix (`%LOCALAPPDATA%\wayforge` holds `bin/` and `share/`); that is accepted because the cache is disposable and recreatable, and the notice never assumes the prefix is writable on other layouts.

4. **ADR-0031 amendment (win32 exception list).** ADR-0031 documents `tracking.ts`'s `isTempPath()` TEMP-gating as the single accepted `win32` platform exception. This ADR amends that list: `release.ts`'s `resolveUpdateStateDir()` and `self-update.ts`'s platform-derived checks (binary/share asset naming via `process.platform`, chmod skip on win32) are accepted `win32` exceptions (per Decision 3 and Decision 6). No code churn; the documented exception list is extended.

5. **Numeric `schemaVersion` convention.** The update-check cache uses a numeric `schemaVersion` (`CACHE_SCHEMA_VERSION = 1`) and readers discard any entry whose value differs, treating it as absent. Note the deliberate contrast: `installed-projects.json` uses the string `'1.0.0'` for its schema field (#229 scope); new wayforge state files should use the numeric convention.

6. **Self-update replacement strategy.** `self-update` refuses to run from a source checkout (`isInstalledBinary()`), resolves the prefix (`WAYFORGE_INSTALL_DIR` first, else the running binary path), downloads the binary, the share archive, and `wayforge-checksums.txt` into the OS temp dir, and verifies both SHA-256 hashes **before any filesystem mutation of the install** (the verified binary is then staged into `bin/` for the atomic rename). It extracts the share into `<prefix>/share/.wayforge-update-<pid>` and verifies `base/` + `VERSION` equals the target, then replaces share first and binary second using `*.old-<pid>` backups (a stale backup with the same pid is cleared first). On Windows the running `wfg.exe` is renamed away (Windows cannot overwrite a running exe); on Unix the new binary is `chmod 0755` and renamed over the old one. Failures restore backups and remove temps; the command prints a one-shot installer fallback. Stale `*.old-<pid>` / temp artifacts older than 7 days are cleaned only on the actual update path — `--check` and `--dry-run` are read-only. Extraction uses the system `tar` (Windows 10+ ships bsdtar, which reads both `.tar.gz` and `.zip`); no new npm dependencies.

## Consequences

- The first release containing `self-update` must publish `wayforge-checksums.txt`; earlier releases cannot be self-update targets. Users upgrade to that release with the existing one-shot installer.
- The checksum file is strictly additive: existing artifact names are never renamed, preserving installer download contracts.
- `self-update` stays in the notice's blocked-command set (it performs its own check).
- Real running-exe replacement on Windows and Unix, checksum-mismatch abort on a real install, and checksum publication are human-validated on the next release.

## Related

- ADR-0031 (Windows parity) — `win32` exception list amended (Decision 4).
- ADR-0035 (One-Shot CLI Installer) — install layout and installer fallback surface.
- ADR-0045 (Self-Hosted Release Runner) — the release pipeline publishing the checksums.
- Plan: `docs/ai/plans/2026-10-21_113442-issue-237-cli-release-detection-self-update.md`
