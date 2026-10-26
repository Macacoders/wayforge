# ADR-0047: CLI Release Check and Verified Upgrade

Date: 2026-10-21
Amended: 2026-10-23
Status: Accepted

## Context

The installed `wfg` CLI needs to learn about new GitHub releases and replace itself safely. Issue #237 originally implemented (Task 1) a cached release check with a one-line notice and (Task 2) a self-replacement command that downloaded the release binary and share archive, verified SHA-256 checksums, and replaced the install with backup/rollback.

Before that design was released, the direction changed to two explicit commands — `wfg update` (check and report only) and `wfg upgrade` (confirm, verify, and install) — with no automatic network access. This ADR records the surviving decisions, the withdrawn ones, and the consequences of the revision.

> Revision note (2026-10-23): the automatic notice/cache and `wfg self-update` described by the original version of this ADR are replaced by the explicit `wfg update` / `wfg upgrade` design below. The original design was not released.

## Decision

1. **Trust anchor and same-origin checksum limits.** The release root (`WAYFORGE_RELEASE_ROOT`, default `https://github.com/Macacoders/wayforge/releases`) is the trust anchor. `wayforge-checksums.txt` is fetched from the same origin as the assets it describes, so it defends against transit corruption and mis-published asset bytes, **not** against a compromised release channel (a channel attacker can rewrite both asset and checksum). Asset signing or checksum pinning is deliberately out of scope; revisit if the release channel threat model changes.

2. **Explicit commands; no automatic release checks.** `wfg update` is read-only: it resolves the latest release, prints the current and latest versions, and reports either an available update or that wayforge is up to date. It performs no download and writes nothing. `wfg upgrade` is the only install path and requires an installed binary and a resolvable prefix. `wfg upgrade --yes` is retained to skip the prompt. `--check` and `--dry-run` are removed from the upgrade surface: `wfg update` is the only non-mutating check. `wfg update` may run from a source checkout; `wfg upgrade` refuses and points at `git pull` or the one-shot installer. The `wfg update` name is reserved for this CLI release check; #238's managed-project refresh must adopt a different verb before implementation.

   Every explicit `wfg update`/`wfg upgrade` performs a fresh release lookup; there is no TTL, no cache, and no startup hook. Commands other than `update` and `upgrade` never perform a release check or print a notice. `WAYFORGE_RELEASE_ROOT` remains the test/override seam, with the existing 5-second lookup and 60-second download timeouts.

   Exit codes: `wfg update` exits 0 whether or not a newer release exists, and 1 on a release-lookup/parse error. `wfg upgrade` exits 0 for updated, up-to-date, or user-declined, and 1 for a source checkout, missing prefix, verification failure, or installation failure.

3. **Verification before mutation.** The upgrade downloads the binary, the share archive, and `wayforge-checksums.txt` into the OS temp directory and verifies both SHA-256 hashes **before changing the installed binary or `share/wayforge` contents**. It extracts the share into `<prefix>/share/.wayforge-update-<pid>-<token>`, validates `base/` and `VERSION`, and only then runs stale cleanup and stages/replaces. The per-run token guarantees that failed verification cannot delete or reuse pre-existing temp artifacts, including artifacts from an earlier process with the same PID. If archive validation fails, this run's temporary extraction directory is removed in `finally`; the installed contents and pre-existing stale artifacts remain unchanged. Stale backup/temp cleanup runs only after checksum and archive verification, immediately before staging and replacement. A missing checksum entry, mismatched checksum, or invalid archive leaves the installed binary, `share/wayforge`, and pre-existing stale artifacts untouched.

4. **Temporary rollback is not backup/downgrade support.** `*.old-<pid>` backups and temp artifacts exist only to recover from a failed replacement. A successful upgrade removes its own backups where possible; on Windows the running `wfg.exe` image cannot be removed while executing, so its `.old-<pid>` backup may remain until a later verified upgrade cleans it after 7 days. This is expected, not an inconsistent install. Stale artifacts older than 7 days are removed only on a verified replacement path. There is no user-facing backup, restore, or version-downgrade command, and `wfg upgrade` never downgrades when the latest release is older than the installed version.

5. **ADR-0031 amendment (win32 exception list).** ADR-0031 documents `tracking.ts`'s `isTempPath()` TEMP-gating as the single accepted `win32` platform exception. This ADR adds only `upgrade.ts`'s platform-derived checks (binary/share asset naming via `process.platform`, chmod skip on win32) as accepted `win32` exceptions. The former `release.ts` state-directory exception is removed with the cache. No code churn; the documented exception list is updated.

6. **Upgrade replacement strategy.** `upgrade` refuses to run from a source checkout (`isInstalledBinary()`), resolves the prefix (`WAYFORGE_INSTALL_DIR` first, else the running binary path), downloads the binary, the share archive, and `wayforge-checksums.txt` into the OS temp dir, and verifies both SHA-256 hashes **before changing the installed binary or share contents** (the verified binary is then staged into `bin/` for the atomic rename). It extracts the share into `<prefix>/share/.wayforge-update-<pid>-<token>` and verifies `base/` + `VERSION` equals the target; the per-run token guarantees that failed verification cannot delete or reuse pre-existing temp artifacts. It then replaces share first and binary second using `*.old-<pid>` backups (a stale backup with the same pid is cleared first). On Windows the running `wfg.exe` is renamed away (Windows cannot overwrite a running exe); on Unix the new binary is `chmod 0755` and renamed over the old one. Failures restore backups and remove temps; the command prints a one-shot installer fallback. A process crash between the share and binary renames is not auto-recovered: `.old-<pid>` backups remain and the one-shot installer is the fallback. Stale `*.old-<pid>` / temp artifacts older than 7 days are cleaned only after verification on the replacement path. Extraction uses the system `tar` (Windows 10+ ships bsdtar, which reads both `.tar.gz` and `.zip`); no new npm dependencies.

7. **Withdrawn decisions.** The following decisions from the original version are explicitly withdrawn, not silently erased: the 24-hour cache/latency budget and its cache-first behavior; the TTY/CI/non-interactive/blocked-command gating for a startup notice; `WAYFORGE_NO_UPDATE_CHECK`; the per-user cache placement and `%LOCALAPPDATA%`/`XDG_STATE_HOME` layout; `WAYFORGE_STATE_DIR`; and the numeric `CACHE_SCHEMA_VERSION` convention for `update-check.json`. No compatibility alias or dormant cache is kept.

## Consequences

- **Passive discovery.** Installed users get no in-band signal that a new release exists. Discovery is user-initiated (`wfg update`) or external (the GitHub releases page). This is the deliberate trade-off of removing the automatic notice.
- **Tracking isolation and orphan-cache acceptance.** `installed-projects.json` and `tracking.resolveStateDir()` are unaffected: no migration and no code change. Leftover `update-check.json` files from test or maintainer installs are accepted disposable residue with no cleanup code.
- The first release containing `upgrade` must publish `wayforge-checksums.txt`; earlier releases cannot be `wfg upgrade` targets. Users upgrade to that release with the existing one-shot installer.
- The checksum file is strictly additive: existing artifact names are never renamed, preserving installer download contracts.
- No downgrade path is provided; a newer installed version stays put even if the latest tag is older.
- Real running-exe replacement on Windows and Unix, checksum-mismatch abort on a real install, and checksum publication are human-validated on the next release.

## Related

- ADR-0031 (Windows parity) — `win32` exception list amended (Decision 5).
- ADR-0035 (One-Shot CLI Installer) — install layout and installer fallback surface.
- [ADR-0045](ADR-0045-self-hosted-release-runner-cross-compilation.md) (Self-Hosted Release Runner) — the release pipeline publishing the checksums.
- Plan: `docs/ai/plans/2026-10-23_145950-issue-237-update-upgrade-revision.md`
- Superseded plan: `docs/ai/plans/2026-10-21_113442-issue-237-cli-release-detection-self-update.md` (the automatic notice/cache and self-replacement command were replaced by this amendment).
